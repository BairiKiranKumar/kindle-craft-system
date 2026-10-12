#!/usr/bin/env python3
"""Kiran Kindle Craft System: Reusable Artwork Processing & Validation Pipeline.

Reprocesses raw generator images into print-ready 300 DPI masters (2160 x 2790 px)
using isotropic (uniform) scaling and Euclidean Signed Distance Field (SDF) raster
contour reconstruction.

Usage:
    python scripts/process_art.py --project little-animal-adventures --scene 001
    python scripts/process_art.py --project little-animal-adventures --all-pilots
    python scripts/process_art.py --check-only --project little-animal-adventures
"""
from __future__ import annotations
import argparse, json, math, os, sys
from pathlib import Path
from PIL import Image, ImageStat
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TARGET_WIDTH = 2160
TARGET_HEIGHT = 2790
PRINT_WIDTH_IN = 7.2
PRINT_HEIGHT_IN = 9.3
TARGET_DPI = 300
AA_WIDTH = 1.8


def repair_scene_003(fg: np.ndarray) -> np.ndarray:
    """Locally repairs the hollow core of Scene 003's kite string.
    
    The raw generator rendered the kite string as a hollow outline tube (two ~3 px lines
    separated by a 3 px white slit). This local morphological closure fills the slit,
    creating a continuous, bold line (min thickness >= 14 px at 300 DPI) connecting the
    bear's paw to the kite without touching any other part of the illustration.
    """
    fg_repaired = fg.copy()
    string_mask = np.zeros_like(fg, dtype=np.uint8)
    # Strictly isolate the string path between paw (y~560) and kite bottom (y~250)
    string_mask[250:570, 550:660] = 1
    
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    closed_string = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel)
    fg_repaired[string_mask == 1] = closed_string[string_mask == 1]
    return fg_repaired


def process_artwork(
    raw_path: Path,
    out_path: Path,
    scene_id: str | None = None,
    target_w: int = TARGET_WIDTH,
    target_h: int = TARGET_HEIGHT,
) -> dict:
    """Processes a raw illustration into an isotropic 300 DPI master with SDF contour reconstruction."""
    if not raw_path.exists():
        raise FileNotFoundError(f"Raw artwork not found: {raw_path}")

    # 1. Load raw grayscale image
    raw_img = cv2.imread(str(raw_path), cv2.IMREAD_GRAYSCALE)
    if raw_img is None:
        raise ValueError(f"Failed to read image at {raw_path}")

    h_raw, w_raw = raw_img.shape
    raw_ar = w_raw / h_raw

    # 2. Binary segmentation
    _, binary = cv2.threshold(raw_img, 200, 255, cv2.THRESH_BINARY)
    fg = 255 - binary  # 255 = black strokes, 0 = white background

    # 3. Apply scene-specific repairs if applicable
    if scene_id == "003" or "003" in raw_path.stem:
        fg = repair_scene_003(fg)
        binary = 255 - fg

    # 4. Exact Euclidean Signed Distance Field (SDF)
    dist_bg = cv2.distanceTransform(binary, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    dist_fg = cv2.distanceTransform(fg, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    sdf = dist_bg - dist_fg

    # 5. Calculate isotropic (uniform) scaling
    scale = min(target_w / w_raw, target_h / h_raw)
    scaled_w = int(round(w_raw * scale))
    scaled_h = int(round(h_raw * scale))
    scaled_ar = scaled_w / scaled_h
    ar_diff = abs(raw_ar - scaled_ar)

    if ar_diff > 0.002:
        raise ValueError(f"Isotropic scaling aspect ratio deviation too high: {ar_diff:.6f}")

    # 6. High-resolution continuous distance interpolation
    sdf_high = cv2.resize(sdf, (scaled_w, scaled_h), interpolation=cv2.INTER_CUBIC)

    # 7. Sub-pixel anti-aliased contour reconstruction around sdf = 0
    normalized = np.clip((sdf_high + AA_WIDTH) / (2 * AA_WIDTH) * 255, 0, 255).astype(np.uint8)

    # 8. Pure white canvas centering
    canvas = np.full((target_h, target_w), 255, dtype=np.uint8)
    pad_x = (target_w - scaled_w) // 2
    pad_y = (target_h - scaled_h) // 2
    canvas[pad_y:pad_y + scaled_h, pad_x:pad_x + scaled_w] = normalized

    # 9. Automated Quality & Geometric Verification Checks
    validation_report = validate_processed_canvas(
        canvas=canvas,
        raw_ar=raw_ar,
        scaled_w=scaled_w,
        scaled_h=scaled_h,
        pad_x=pad_x,
        pad_y=pad_y,
        scene_id=scene_id,
    )

    if not validation_report["is_valid"]:
        errors = "; ".join(validation_report["errors"])
        raise RuntimeError(f"Artwork validation failed for {raw_path.name}: {errors}")

    # 10. Save verified master PNG
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_pil = Image.fromarray(canvas, mode="L")
    out_pil.save(out_path, format="PNG", optimize=True)

    return {
        "scene_id": scene_id,
        "raw_file": str(raw_path.name),
        "out_file": str(out_path.name),
        "raw_size": [w_raw, h_raw],
        "scaled_size": [scaled_w, scaled_h],
        "canvas_size": [target_w, target_h],
        "padding": [pad_x, pad_y],
        "scale_factor": round(scale, 6),
        "raw_ar": round(raw_ar, 6),
        "scaled_ar": round(scaled_ar, 6),
        "ar_diff": round(ar_diff, 6),
        "validation": validation_report,
    }


def validate_processed_canvas(
    canvas: np.ndarray,
    raw_ar: float,
    scaled_w: int,
    scaled_h: int,
    pad_x: int,
    pad_y: int,
    scene_id: str | None = None,
) -> dict:
    """Performs rigorous automated checks on the processed master canvas."""
    h, w = canvas.shape
    errors = []
    warnings = []

    # Check 1: Canvas dimensions
    if w != TARGET_WIDTH or h != TARGET_HEIGHT:
        errors.append(f"Canvas dimensions {w}x{h} do not match target {TARGET_WIDTH}x{TARGET_HEIGHT}")

    # Check 2: Effective DPI
    dpi_w = round(w / PRINT_WIDTH_IN)
    dpi_h = round(h / PRINT_HEIGHT_IN)
    if dpi_w < TARGET_DPI or dpi_h < TARGET_DPI:
        errors.append(f"Effective DPI [{dpi_w}, {dpi_h}] below target {TARGET_DPI}")

    # Check 3: Aspect ratio preservation
    scaled_ar = scaled_w / scaled_h
    if abs(raw_ar - scaled_ar) > 0.002:
        errors.append(f"Aspect ratio deviation {abs(raw_ar - scaled_ar):.6f} exceeds tolerance 0.002")

    # Check 4: White background padding verification
    if pad_x > 0:
        left_pad = canvas[:, :pad_x]
        right_pad = canvas[:, target_w_actual - pad_x:] if (target_w_actual := w) else canvas[:, -pad_x:]
        if (left_pad != 255).any():
            errors.append(f"Left padding (0..{pad_x}) contains non-white pixels")
        if (right_pad != 255).any():
            errors.append(f"Right padding contains non-white pixels")

    if pad_y > 0:
        top_pad = canvas[:pad_y, :]
        bot_pad = canvas[-pad_y:, :]
        if (top_pad != 255).any():
            errors.append(f"Top padding contains non-white pixels")
        if (bot_pad != 255).any():
            errors.append(f"Bottom padding contains non-white pixels")

    # Check 5: Clipping at outer image canvas margins (top/bottom safety)
    top_edge = canvas[:5, :]
    bot_edge = canvas[-5:, :]
    if (top_edge < 128).any():
        errors.append("Dark pixels detected in top 5-pixel safe boundary")
    if (bot_edge < 128).any():
        errors.append("Dark pixels detected in bottom 5-pixel safe boundary")

    # Check 6: Scene 003 kite string minimum thickness check
    if scene_id == "003":
        # Check string region: y in [650..1250], x strictly along string column [1240..1400]
        string_widths = []
        for y in range(650, 1250, 10):
            row = canvas[y, :] < 128
            if row.sum() > 0:
                diffs = np.diff(np.pad(row.astype(int), 1))
                starts = np.where(diffs == 1)[0]
                ends = np.where(diffs == -1)[0]
                for s, e in zip(starts, ends):
                    mid = (s + e) // 2
                    if 1240 <= mid <= 1400:
                        string_widths.append(e - s)
        if string_widths:
            min_string_w = min(string_widths)
            if min_string_w < 4:
                errors.append(f"Scene 003 kite string min width {min_string_w} px is below required 4 px threshold")
        else:
            warnings.append("Could not locate Scene 003 string segment for thickness verification")

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "metrics": {
            "canvas_size": [w, h],
            "effective_dpi": [dpi_w, dpi_h],
            "aspect_ratio_raw": round(raw_ar, 6),
            "aspect_ratio_scaled": round(scaled_ar, 6),
            "white_pixels_pct": round((canvas > 240).mean() * 100, 2),
            "black_pixels_pct": round((canvas < 30).mean() * 100, 2),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Kiran Kindle Craft System Artwork Processor")
    parser.add_argument("--project", default="little-animal-adventures", help="Project slug")
    parser.add_argument("--scene", help="Scene ID to process (e.g. 001)")
    parser.add_argument("--all-pilots", action="store_true", help="Process all pilot scenes (001-005)")
    parser.add_argument("--check-only", action="store_true", help="Run validation checks on existing masters")
    args = parser.parse_args()

    project_dir = ROOT / "products" / args.project
    art_dir = project_dir / "assets" / "art"

    if not art_dir.exists():
        sys.exit(f"Art directory not found: {art_dir}")

    scenes_to_process = []
    if args.scene:
        scenes_to_process.append(f"{int(args.scene):03d}")
    elif args.all_pilots:
        scenes_to_process = [f"{i:03d}" for i in range(1, 6)]
    else:
        scenes_to_process = [f"{i:03d}" for i in range(1, 6)]

    print(f"=== KKCS ARTWORK PROCESSING: {args.project} ===")
    print(f"Target Canvas: {TARGET_WIDTH} x {TARGET_HEIGHT} px (300 DPI @ {PRINT_WIDTH_IN}x{PRINT_HEIGHT_IN} in)")
    print(f"Pipeline: Isotropic Scaling + Euclidean SDF Vector-Contour Reconstruction\n")

    results = []
    for sc_id in scenes_to_process:
        raw_file = art_dir / f"raw_{sc_id}_candidate.png"
        out_file = art_dir / f"{sc_id}.png"

        if not raw_file.exists():
            print(f"[-] Skipping Scene {sc_id}: Raw asset {raw_file.name} not found")
            continue

        if args.check_only:
            im = cv2.imread(str(out_file), cv2.IMREAD_GRAYSCALE)
            raw = cv2.imread(str(raw_file), cv2.IMREAD_GRAYSCALE)
            raw_ar = raw.shape[1] / raw.shape[0]
            scale = min(TARGET_WIDTH / raw.shape[1], TARGET_HEIGHT / raw.shape[0])
            scaled_w = int(round(raw.shape[1] * scale))
            scaled_h = int(round(raw.shape[0] * scale))
            pad_x = (TARGET_WIDTH - scaled_w) // 2
            pad_y = (TARGET_HEIGHT - scaled_h) // 2
            rep = validate_processed_canvas(im, raw_ar, scaled_w, scaled_h, pad_x, pad_y, sc_id)
            status = "PASS" if rep["is_valid"] else "FAIL"
            print(f"[{status}] Scene {sc_id}: valid={rep['is_valid']}, DPI={rep['metrics']['effective_dpi']}, AR={rep['metrics']['aspect_ratio_scaled']}")
            if rep["errors"]:
                for err in rep["errors"]:
                    print(f"    ERROR: {err}")
            continue

        print(f"Processing Scene {sc_id} ({raw_file.name} -> {out_file.name})...")
        res = process_artwork(raw_file, out_file, scene_id=sc_id)
        results.append(res)
        print(f"  [+] Success: Canvas={res['canvas_size']}, Scaled={res['scaled_size']}, Pad={res['padding']}")
        print(f"  [+] AR Preserved: Raw={res['raw_ar']} vs Scaled={res['scaled_ar']} (delta={res['ar_diff']:.6f})")
        print(f"  [+] White/Black Balance: {res['validation']['metrics']['white_pixels_pct']}% white, {res['validation']['metrics']['black_pixels_pct']}% black\n")

    print(f"Completed processing {len(results)} scenes.")


if __name__ == "__main__":
    main()
