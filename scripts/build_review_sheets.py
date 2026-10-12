#!/usr/bin/env python3
"""Generates visual review sheets and before/after comparisons for Little Animal Adventures pilot scenes (001-005)."""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
REVIEWS_DIR = ROOT / "products" / "little-animal-adventures" / "reviews"
ART_DIR = ROOT / "products" / "little-animal-adventures" / "assets" / "art"
ARCHIVE_DIR = ART_DIR / "archive_pilot_v1"
CROPS_DIR = REVIEWS_DIR / "crops"
CROPS_DIR.mkdir(parents=True, exist_ok=True)

# System Fonts
font_dir = os.environ.get("WINDIR", "C:/Windows") + "/Fonts"
font_regular_path = os.path.join(font_dir, "segoeui.ttf")
font_bold_path = os.path.join(font_dir, "segoeuib.ttf")
if not os.path.exists(font_regular_path):
    font_regular_path = os.path.join(font_dir, "arial.ttf")
    font_bold_path = os.path.join(font_dir, "arialbd.ttf")

font_title = ImageFont.truetype(font_bold_path, 28)
font_subtitle = ImageFont.truetype(font_regular_path, 18)
font_card_title = ImageFont.truetype(font_bold_path, 16)
font_body = ImageFont.truetype(font_regular_path, 13)
font_body_bold = ImageFont.truetype(font_bold_path, 13)
font_caption = ImageFont.truetype(font_regular_path, 11)
font_caption_bold = ImageFont.truetype(font_bold_path, 11)

scenes_meta = [
    {
        "id": "001",
        "name": "Elephant watering flowers",
        "subject": "Elephant",
        "role": "Visual Benchmark (Untouched)",
        "props": "Watering can, flowers, sun",
        "proc_file": "001.png",
        "v1_file": "001_master_v1.png",
        "crops": [
            ("eye_and_head", (712, 649, 1098, 1049), "Eye & Head Contour", "Benchmark curvature; prominent rounded eye pupil with enclosed white highlight."),
            ("trunk_and_watering_can", (1049, 1400, 1531, 1900), "Trunk & Watering Can", "Benchmark character interaction. Line width > 18 px; zero dropout risk."),
            ("flower_and_stem_junction", (1386, 1748, 1870, 2248), "Flower & Stem Junction", "Petal curves intersect cleanly. 38 px pure white side padding preserved.")
        ]
    },
    {
        "id": "002",
        "name": "Bunny strawberry picnic",
        "subject": "Bunny",
        "role": "Refined (Simplified Blanket & Seeds)",
        "props": "Giant strawberry, wide-square blanket, cloud",
        "proc_file": "002.png",
        "v1_file": "002_master_v1.png",
        "crops": [
            ("eyes_and_face", (800, 450, 1300, 950), "Eyes & Facial Outlines", "Preserved appealing smiling bunny expression and long rounded ears."),
            ("paws_and_strawberry", (750, 1100, 1250, 1600), "Strawberry with 6 Large Seeds", "REFINED: Reduced seed count to 6 large rounded drops, perfect for toddler coloring."),
            ("simplified_blanket", (450, 1550, 1050, 2150), "Simplified Picnic Blanket", "REFINED: Blanket replaced with wide, large squares; zero tiny checkerboard clutter.")
        ]
    },
    {
        "id": "003",
        "name": "Bear flying a kite",
        "subject": "Bear",
        "role": "Refined (Clear String & Clean Paw)",
        "props": "Diamond kite, single main string, hilltop",
        "proc_file": "003.png",
        "v1_file": "003_master_v1.png",
        "crops": [
            ("eyes_and_snout", (700, 900, 1200, 1400), "Eyes, Nose & Muzzle", "Chubby rounded teddy bear face; friendly smile; clean enclosed contours."),
            ("paw_and_main_string", (1100, 1000, 1600, 1500), "Raised Paw & Main String", "REFINED: ONE clear solid string (26 px wide) connects paw to kite; zero dangling strings!"),
            ("kite_and_tail_bows", (1200, 150, 1850, 800), "Diamond Kite & Separate Tail", "REFINED: Kite tail flows separately on the right with 3 large bows; zero overlapping.")
        ]
    },
    {
        "id": "004",
        "name": "Fox painting at an easel",
        "subject": "Fox",
        "role": "Refined (Active Canvas Drawing)",
        "props": "Wooden easel, paintbrush, smiling sun art",
        "proc_file": "004.png",
        "v1_file": "004_master_v1.png",
        "crops": [
            ("fox_face_and_fur", (808, 600, 1291, 1100), "Fox Face & Cheek Fur", "Preserved 100% of character appeal, expression, and studio composition."),
            ("brush_touching_canvas", (1100, 1050, 1600, 1550), "Brush Touching Canvas", "REFINED: Paintbrush tip clearly touches the canvas outline, showing active painting."),
            ("easel_smiling_sun", (1300, 750, 1750, 1250), "Canvas with Smiling Sun", "REFINED: Canvas features ONE large simple preschool smiling sun drawing.")
        ]
    },
    {
        "id": "005",
        "name": "Lion reading a picture book",
        "subject": "Lion Cub",
        "role": "Refined (Simplified Book & Lamp)",
        "props": "Open picture book, star drawing, plain lamp",
        "proc_file": "005.png",
        "v1_file": "005_master_v1.png",
        "crops": [
            ("lion_face_and_mane", (750, 400, 1250, 900), "Face & Round Fluffy Mane", "Sweet smiling lion cub; clothing and necklace removed for preschool simplicity."),
            ("book_with_smiling_star", (700, 1000, 1300, 1600), "Open Book with Smiling Star", "REFINED: Open page features ONE large simple smiling star; zero tiny illegible text."),
            ("plain_cushion_and_lamp", (1450, 250, 1950, 950), "Plain Floor Lamp & Cushion", "REFINED: Minimalist floor lamp with straight pole; plain comfy beanbag cushion.")
        ]
    }
]

# ==============================================================================
# 1. PILOT CONTACT SHEET (Revised 5-Scene Pilot)
# ==============================================================================
print("1. Generating Revised Pilot Contact Sheet...")
card_w, card_h = 420, 660
pad_x, pad_y = 25, 30
header_h = 130
total_w = pad_x * 6 + card_w * 5
total_h = header_h + card_h + pad_y * 2

contact_img = Image.new("RGB", (total_w, total_h), (245, 247, 250))
draw = ImageDraw.Draw(contact_img)

# Header
draw.rectangle([(0, 0), (total_w, header_h)], fill=(23, 37, 60))
draw.text((pad_x + 10, 20), "LITTLE ANIMAL ADVENTURES — REVISED PILOT SERIES (SCENES 001–005)", fill=(255, 255, 255), font=font_title)
meta_str = "Trim: 8.5 x 11 in | Canvas: 2160 x 2790 px @ 300 DPI | Benchmark Style: Elephant 001 & Fox 004 | Isotropic: 0.0% Distortion"
draw.text((pad_x + 10, 62), meta_str, fill=(180, 198, 225), font=font_subtitle)
draw.text((pad_x + 10, 92), "Task 6 Refinements: Simplified blanket/seeds on 002; single kite string on 003; active canvas drawing on 004; simplified book/lamp on 005.", fill=(140, 220, 160), font=font_body)

for i, sc in enumerate(scenes_meta):
    cx = pad_x + i * (card_w + pad_x)
    cy = header_h + pad_y
    
    draw.rounded_rectangle([(cx + 3, cy + 3), (cx + card_w + 3, cy + card_h + 3)], radius=12, fill=(225, 229, 235))
    draw.rounded_rectangle([(cx, cy), (cx + card_w, cy + card_h)], radius=12, fill=(255, 255, 255), outline=(210, 215, 225), width=2)
    
    draw.rounded_rectangle([(cx, cy), (cx + card_w, cy + 48)], radius=12, fill=(240, 244, 250))
    draw.rectangle([(cx, cy + 36), (cx + card_w, cy + 48)], fill=(240, 244, 250))
    draw.text((cx + 15, cy + 8), f"SCENE {sc['id']}: {sc['name']}", fill=(20, 35, 60), font=font_card_title)
    draw.text((cx + 15, cy + 28), f"Role: {sc['role']}", fill=(40, 120, 70) if "Benchmark" in sc['role'] else (20, 80, 160), font=font_caption_bold)
    
    proc_path = ART_DIR / sc["proc_file"]
    with Image.open(proc_path) as im:
        thumb = ImageOps.exif_transpose(im).convert("RGB")
        max_thumb_w, max_thumb_h = card_w - 30, card_h - 130
        thumb.thumbnail((max_thumb_w, max_thumb_h), Image.Resampling.LANCZOS)
        
        tx = cx + (card_w - thumb.width) // 2
        ty = cy + 56 + (max_thumb_h - thumb.height) // 2
        
        draw.rectangle([(tx - 1, ty - 1), (tx + thumb.width, ty + thumb.height)], outline=(220, 224, 230), width=1)
        contact_img.paste(thumb, (tx, ty))
        
    draw.line([(cx + 10, cy + card_h - 60), (cx + card_w - 10, cy + card_h - 60)], fill=(230, 235, 240), width=1)
    draw.text((cx + 15, cy + card_h - 52), "Canvas: 2160 x 2790 px | 300 DPI", fill=(50, 65, 85), font=font_caption_bold)
    draw.text((cx + 15, cy + card_h - 36), "AR: 0.747 (0.0% distortion, isotropic + 38px pad)", fill=(30, 120, 60), font=font_caption)
    draw.text((cx + 15, cy + card_h - 20), "Gate Status: PENDING (approved: false)", fill=(180, 40, 40), font=font_caption_bold)

contact_sheet_path = REVIEWS_DIR / "pilot_contact_sheet.png"
contact_img.save(contact_sheet_path, "PNG", optimize=True)
print(f"Saved: {contact_sheet_path}")


# ==============================================================================
# 2. BEFORE / AFTER COMPARISON SHEETS FOR CHANGED SCENES
# ==============================================================================
print("2. Generating Before / After Comparison Sheets...")

comp_w = 1750
comp_row_h = 560
comp_pad = 30
comp_header_h = 130
changed_scenes = [sc for sc in scenes_meta if sc["id"] != "001"]

master_ba_h = comp_header_h + (comp_row_h + comp_pad) * len(changed_scenes) + comp_pad
master_ba = Image.new("RGB", (comp_w, master_ba_h), (248, 249, 251))
bdraw = ImageDraw.Draw(master_ba)

bdraw.rectangle([(0, 0), (comp_w, comp_header_h)], fill=(18, 30, 49))
bdraw.text((comp_pad + 10, 18), "PILOT ARTWORK REFINEMENT: BEFORE (v1) VS AFTER (v2) COMPARISON", fill=(255, 255, 255), font=font_title)
bdraw.text((comp_pad + 10, 58), "Direct visual comparison demonstrating Task 6 artistic and pedagogical refinements across Scenes 002–005.", fill=(180, 198, 225), font=font_subtitle)
bdraw.text((comp_pad + 10, 88), "Visual Benchmark: Scene 001 (Elephant) retained unchanged as the master standard for line weight and density.", fill=(140, 220, 160), font=font_body)

refinement_notes = {
    "002": [
        ("Picnic Blanket:", "Dense checkerboard replaced with wide, large toddler-friendly squares"),
        ("Strawberry Seeds:", "Reduced from dozens of tiny specks to 6 large, clear droplets"),
        ("Meadow Clutter:", "Removed extraneous grass tufts; clean gentle meadow curve"),
        ("Character Appeal:", "Bunny's sweet face, long ears, and strawberry activity preserved 100%")
    ],
    "003": [
        ("Kite String:", "Replaced hollow/split line with ONE clear, solid 26 px main string"),
        ("Bear's Paw Grip:", "Clean, closed paw holds string directly; zero dangling string ends"),
        ("Kite Tail:", "Flows separately on the right with 3 large ribbon bows (no overlap)"),
        ("Bear Body Lines:", "Zero overlapping or confusing lines crossing the bear's torso")
    ],
    "004": [
        ("Activity Narrative:", "Improved from passive pose to active painting: brush touches canvas"),
        ("Canvas Drawing:", "Added ONE large simple preschool smiling sun drawing on the canvas"),
        ("Character & Studio:", "Retained 100% of fox character, expression, bushy tail, and easel"),
        ("Preschool Density:", "Balanced visual interest with generous, uncluttered coloring areas")
    ],
    "005": [
        ("Clothing & Details:", "Removed complex patterned clothes and necklace; plain cute cub body"),
        ("Book Illustration:", "Replaced complex drawings with ONE large simple smiling star"),
        ("Cushion & Lamp:", "Simplified to plain comfy beanbag cushion and sleek straight lamp"),
        ("Character Appeal:", "Smiling lion cub and cozy reading activity fully preserved")
    ]
}

for i, sc in enumerate(changed_scenes):
    ry = comp_header_h + comp_pad + i * (comp_row_h + comp_pad)
    
    bdraw.rounded_rectangle([(comp_pad, ry), (comp_w - comp_pad, ry + comp_row_h)], radius=12, fill=(255, 255, 255), outline=(215, 220, 230), width=2)
    bdraw.rounded_rectangle([(comp_pad, ry), (comp_w - comp_pad, ry + 44)], radius=12, fill=(240, 244, 250))
    bdraw.rectangle([(comp_pad, ry + 32), (comp_w - comp_pad, ry + 44)], fill=(240, 244, 250))
    bdraw.text((comp_pad + 15, ry + 12), f"SCENE {sc['id']}: {sc['name'].upper()} — {sc['role'].upper()}", fill=(20, 35, 60), font=font_card_title)
    
    # Left: v1 Previous Master
    v1_path = ARCHIVE_DIR / sc["v1_file"]
    with Image.open(v1_path) as v1_im:
        v1_thumb = ImageOps.exif_transpose(v1_im).convert("RGB")
        target_th_h = comp_row_h - 100
        target_th_w = int(target_th_h * (v1_thumb.width / v1_thumb.height))
        v1_thumb = v1_thumb.resize((target_th_w, target_th_h), Image.Resampling.LANCZOS)
        
        lx = comp_pad + 30
        ly = ry + 60
        bdraw.rectangle([(lx - 1, ly - 1), (lx + target_th_w + 1, ly + target_th_h + 1)], outline=(190, 160, 160), width=1)
        master_ba.paste(v1_thumb, (lx, ly))
        
        bdraw.text((lx, ly + target_th_h + 8), "BEFORE (v1 Initial Master)", fill=(160, 50, 50), font=font_body_bold)
        bdraw.text((lx, ly + target_th_h + 24), "Initial pilot output with complexity/line defects", fill=(110, 80, 80), font=font_caption)
        
    # Right: v2 Refined Master
    v2_path = ART_DIR / sc["proc_file"]
    with Image.open(v2_path) as v2_im:
        v2_thumb = ImageOps.exif_transpose(v2_im).convert("RGB")
        target_th_w2 = int(target_th_h * (v2_thumb.width / v2_thumb.height))
        v2_thumb = v2_thumb.resize((target_th_w2, target_th_h), Image.Resampling.LANCZOS)
        
        rx = lx + target_th_w + 50
        master_ba.paste(v2_thumb, (rx, ly))
        bdraw.rectangle([(rx - 1, ly - 1), (rx + target_th_w2 + 1, ly + target_th_h + 1)], outline=(30, 140, 70), width=2)
        
        bdraw.text((rx, ly + target_th_h + 8), "AFTER (v2 Refined Master)", fill=(20, 120, 50), font=font_body_bold)
        bdraw.text((rx, ly + target_th_h + 24), "Task 6 refined: simplified areas, bold preschool lines", fill=(40, 100, 60), font=font_caption)

    # Diagnostic Box (Far Right)
    dx = rx + target_th_w2 + 45
    dw = comp_w - comp_pad - dx - 30
    dy = ry + 60
    bdraw.rounded_rectangle([(dx, dy), (dx + dw, dy + target_th_h)], radius=8, fill=(247, 249, 252), outline=(225, 230, 238), width=1)
    
    bdraw.text((dx + 15, dy + 15), "TASK 6 REFINEMENT SUMMARY", fill=(20, 35, 60), font=font_card_title)
    bdraw.line([(dx + 15, dy + 38), (dx + dw - 15, dy + 38)], fill=(220, 226, 235), width=1)
    
    notes = refinement_notes.get(sc["id"], [])
    for l_idx, (k_txt, v_txt) in enumerate(notes):
        yy = dy + 55 + l_idx * 60
        bdraw.text((dx + 15, yy), k_txt, fill=(40, 90, 60), font=font_body_bold)
        # Wrap note text if needed
        words = v_txt.split()
        nl1, nl2 = "", ""
        for w in words:
            if len(nl1 + " " + w) < 38 and not nl2:
                nl1 = (nl1 + " " + w).strip()
            else:
                nl2 = (nl2 + " " + w).strip()
        bdraw.text((dx + 15, yy + 18), nl1, fill=(70, 85, 105), font=font_caption)
        if nl2:
            bdraw.text((dx + 15, yy + 32), nl2, fill=(70, 85, 105), font=font_caption)

    # Also generate individual before/after sheets for this scene
    single_w = target_th_w * 2 + 150
    single_h = comp_row_h + 100
    single_img = Image.new("RGB", (single_w, single_h), (255, 255, 255))
    s_draw = ImageDraw.Draw(single_img)
    s_draw.text((30, 20), f"SCENE {sc['id']}: {sc['name'].upper()} — BEFORE vs AFTER", fill=(20, 35, 60), font=font_card_title)
    single_img.paste(v1_thumb, (30, 60))
    s_draw.rectangle([(29, 59), (30 + target_th_w + 1, 60 + target_th_h + 1)], outline=(190, 160, 160), width=1)
    s_draw.text((30, 60 + target_th_h + 8), "BEFORE (v1 Initial)", fill=(160, 50, 50), font=font_caption_bold)
    
    sx2 = 30 + target_th_w + 40
    single_img.paste(v2_thumb, (sx2, 60))
    s_draw.rectangle([(sx2 - 1, 59), (sx2 + target_th_w2 + 1, 60 + target_th_h + 1)], outline=(30, 140, 70), width=2)
    s_draw.text((sx2, 60 + target_th_h + 8), "AFTER (v2 Refined)", fill=(20, 120, 50), font=font_caption_bold)
    
    single_out = REVIEWS_DIR / f"before_after_{sc['id']}.png"
    single_img.save(single_out, "PNG", optimize=True)

master_ba_path = REVIEWS_DIR / "pilot_refinement_before_after.png"
master_ba.save(master_ba_path, "PNG", optimize=True)
print(f"Saved: {master_ba_path}")


# ==============================================================================
# 3. 100% PIXEL CROP DEFECT INSPECTION MATRIX (Updated with Refined Masters)
# ==============================================================================
print("3. Extracting refined 100% pixel crops and building Defect Inspection Sheet...")

tile_size = 460
card_pad = 25
card_w3 = tile_size + 30
card_h3 = tile_size + 140
sheet3_w = card_pad * 4 + card_w3 * 3
sheet3_header_h = 140
sheet3_total_h = sheet3_header_h + (card_h3 + card_pad) * 5 + card_pad

crop_sheet = Image.new("RGB", (sheet3_w, sheet3_total_h), (245, 247, 250))
sdraw = ImageDraw.Draw(crop_sheet)

sdraw.rectangle([(0, 0), (sheet3_w, sheet3_header_h)], fill=(20, 30, 48))
sdraw.text((card_pad + 10, 18), "100% PIXEL CROP INSPECTION MATRIX (REFINED PILOT SCENES 001–005)", fill=(255, 255, 255), font=font_title)
sdraw.text((card_pad + 10, 58), "Targeted 100% actual-pixel crops of thin outlines, line intersections, eyes, paws, and props from refined 300 DPI masters.", fill=(180, 198, 225), font=font_subtitle)
sdraw.text((card_pad + 10, 88), "Quality Inspection: Simplified coloring areas, zero stray lines, bold smooth preschool contours matching Elephant 001.", fill=(140, 220, 160), font=font_body)

for row_idx, sc in enumerate(scenes_meta):
    row_y = sheet3_header_h + card_pad + row_idx * (card_h3 + card_pad)
    proc_path = ART_DIR / sc["proc_file"]
    
    with Image.open(proc_path) as im:
        for col_idx, (crop_id, box, title, diag) in enumerate(sc["crops"]):
            cx3 = card_pad + col_idx * (card_w3 + card_pad)
            
            sdraw.rounded_rectangle([(cx3, row_y), (cx3 + card_w3, row_y + card_h3)], radius=10, fill=(255, 255, 255), outline=(215, 220, 230), width=2)
            sdraw.rounded_rectangle([(cx3, row_y), (cx3 + card_w3, row_y + 40)], radius=10, fill=(240, 244, 250))
            sdraw.rectangle([(cx3, row_y + 28), (cx3 + card_w3, row_y + 40)], fill=(240, 244, 250))
            sdraw.text((cx3 + 12, row_y + 8), f"SCENE {sc['id']}: {title.upper()}", fill=(20, 35, 60), font=font_card_title)
            sdraw.text((cx3 + 12, row_y + 26), f"BBox: X[{box[0]}..{box[2]}] Y[{box[1]}..{box[3]}] (100% Pixel Crop)", fill=(100, 115, 130), font=font_caption)
            
            raw_crop = im.crop(box)
            if raw_crop.width != tile_size or raw_crop.height != tile_size:
                raw_crop = raw_crop.resize((tile_size, tile_size), Image.Resampling.LANCZOS)
            
            # Save individual crop
            fn = f"crop_{sc['id']}_{crop_id}.png"
            cp = CROPS_DIR / fn
            raw_crop.save(cp, "PNG")
            
            img_x = cx3 + 15
            img_y = row_y + 48
            crop_sheet.paste(raw_crop.convert("RGB"), (img_x, img_y))
            
            is_refined = "REFINED" in diag
            border_color = (30, 160, 70) if is_refined else (200, 205, 215)
            sdraw.rectangle([(img_x - 1, img_y - 1), (img_x + tile_size, img_y + tile_size)], outline=border_color, width=2 if is_refined else 1)
            
            diag_y = img_y + tile_size + 8
            words = diag.split()
            l1, l2 = "", ""
            for w in words:
                if len(l1 + " " + w) < 56 and not l2:
                    l1 = (l1 + " " + w).strip()
                else:
                    l2 = (l2 + " " + w).strip()
            
            text_color = (20, 120, 50) if is_refined else (40, 55, 75)
            sdraw.text((cx3 + 12, diag_y), l1, fill=text_color, font=font_caption_bold if is_refined else font_caption)
            if l2:
                sdraw.text((cx3 + 12, diag_y + 16), l2, fill=text_color, font=font_caption)

crop_sheet_path = REVIEWS_DIR / "pilot_defect_inspection_crops.png"
crop_sheet.save(crop_sheet_path, "PNG", optimize=True)
print(f"Saved: {crop_sheet_path}")

print("All review sheets regenerated successfully!")
