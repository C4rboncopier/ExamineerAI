"""
OMR (Optical Mark Recognition) processing server.
Runs locally on port 5001. The React frontend sends images here for processing.
Images are processed in memory only — never saved to disk or database.

Start: uvicorn omr_server:app --host 0.0.0.0 --port 5001 --reload

Detection approach: contour-based circle detection (with HoughCircles fallback),
modelled after main-copy.py. Bubbles are located by circularity + area, then
fill is measured by counting dark pixels inside each detected circle.
"""

import asyncio
import io
import json
import base64
import os
import zipfile
from itertools import combinations

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="ExamineerAI OMR Server", version="2.0.0")

OMR_API_KEY = os.environ.get('OMR_API_KEY')

async def verify_api_key(x_omr_key: str | None = Header(default=None)) -> None:
    if OMR_API_KEY and x_omr_key != OMR_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "https://examineerai.site",
        "https://www.examineerai.site",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────

CHOICES = ["A", "B", "C", "D", "E"]
NUM_QUESTIONS = 100

# Normalised warp size (portrait 8.5×11 at ~145 px/in)
DST_W, DST_H = 1240, 1604

# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/scan", dependencies=[Depends(verify_api_key)])
async def scan_single(file: UploadFile = File(...)):
    """Process a single OMR image file."""
    image_bytes = await file.read()
    result = process_omr_image(image_bytes, filename=file.filename or "image")
    return result


@app.post("/scan-batch", dependencies=[Depends(verify_api_key)])
async def scan_batch(file: UploadFile = File(...)):
    """Process a ZIP archive of OMR images, streaming results as NDJSON.

    Each line is a JSON object:
      {"type": "total",  "total": N}          — sent first
      {"type": "result", ...omr_fields}        — sent per image
    """
    zip_bytes = await file.read()

    # Validate ZIP and collect image names before streaming starts
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            image_names = sorted([
                n for n in zf.namelist()
                if n.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".tiff"))
                and not n.startswith("__MACOSX")
            ])
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    if not image_names:
        raise HTTPException(status_code=400, detail="No image files found in ZIP")

    async def generate():
        yield json.dumps({"type": "total", "total": len(image_names)}) + "\n"
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for name in image_names:
                img_bytes = zf.read(name)
                result = await asyncio.to_thread(process_omr_image, img_bytes, name)
                result["filename"] = name
                result["type"] = "result"
                yield json.dumps(result) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


# ──────────────────────────────────────────────
# Core entry point
# ──────────────────────────────────────────────

def process_omr_image(image_bytes: bytes, filename: str = "") -> dict:
    nparr = np.frombuffer(image_bytes, np.uint8)
    color = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if color is None:
        return _error_result("Could not decode image")

    proc = OMRProcessor(color)
    return proc.process()


# ──────────────────────────────────────────────
# OMR Processor class
# ──────────────────────────────────────────────

class OMRProcessor:
    def __init__(self, color_image: np.ndarray):
        self.original = color_image.copy()
        self.gray = cv2.cvtColor(color_image, cv2.COLOR_BGR2GRAY)
        self.debug_image = color_image.copy()
        self.thresh = None
        self.exam_set = ""
        self.roll_number = "00000"
        self.answers: list[str] = [""] * NUM_QUESTIONS
        self.answer_bubble_data: list[dict] = []

    # ── Public entry ──────────────────────────────────────────────────────────

    def process(self) -> dict:
        self._correct_perspective()
        self._preprocess()

        bubbles = self._detect_bubbles()
        if not bubbles:
            return self._build_result("Could not detect bubbles in the image")

        h, w = self.gray.shape

        # Attempt precise section ROI detection via the black title bars.
        # Falls back to percentage splits when the bars aren't found (e.g., older sheets).
        rois = self._find_section_rois()
        if rois:
            exam_set_bubbles = [b for b in bubbles if _in_roi(b, rois["exam_set"])]
            roll_no_bubbles  = [b for b in bubbles if _in_roi(b, rois["roll_no"])]
            answer_bubbles   = [b for b in bubbles if _in_roi(b, rois["answers"])]
        else:
            y_split = int(h * 0.47)
            x_split = int(w * 0.50)
            header_bubbles   = [b for b in bubbles if b[1] < y_split]
            answer_bubbles   = [b for b in bubbles if b[1] >= y_split]
            exam_set_bubbles = [b for b in header_bubbles if b[0] < x_split]
            roll_no_bubbles  = [b for b in header_bubbles if b[0] >= x_split]

        self._read_exam_set(exam_set_bubbles)
        self._read_roll_number(roll_no_bubbles)
        self._read_answers(answer_bubbles)

        return self._build_result()


    def _correct_perspective(self):
        """
        Primary: warp using the 4 solid black registration-mark squares printed
        near each corner of the OMR sheet (.22 in squares, from printOMR.ts).
        Fallback: largest-quadrilateral edge detection.
        """
        gray = self.gray
        h, w = gray.shape

        # ── Try registration marks first ──────────────────────────────────────
        # Pre-blur before Otsu so the threshold value is stable across frames;
        # without it, tiny lighting shifts change the threshold, causing contour
        # boundaries to wobble by 1-2 px and the perspective warp to jitter.
        blurred_for_thresh = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred_for_thresh, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        mark_min = (w * 0.004) ** 2
        mark_max = (w * 0.10) ** 2
        edge_frac = 0.28

        corners: dict = {"tl": None, "tr": None, "bl": None, "br": None}
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if not (mark_min < area < mark_max):
                continue
            bx, by, bw, bh = cv2.boundingRect(cnt)
            if bw == 0 or bh == 0:
                continue
            # Tighter aspect ratio: registration marks are square; loose bounds
            # let non-square blobs compete and alternate between frames.
            if not (0.5 < bw / bh < 2.0):
                continue
            # Solidity check: filled squares score ~1.0; hollow/irregular shapes
            # (box borders, text artefacts) score much lower and are discarded.
            hull_area = cv2.contourArea(cv2.convexHull(cnt))
            if hull_area == 0 or area / hull_area < 0.70:
                continue
            # Use centroid (moments) rather than bounding-rect midpoint — the
            # bounding rect can shift ±1 px on the same blob across frames,
            # while the centroid is sub-pixel stable.
            M = cv2.moments(cnt)
            if M["m00"] == 0:
                continue
            cx, cy = M["m10"] / M["m00"], M["m01"] / M["m00"]
            nl = cx < w * edge_frac
            nr = cx > w * (1 - edge_frac)
            nt = cy < h * edge_frac
            nb = cy > h * (1 - edge_frac)
            if nl and nt:
                _assign_best(corners, "tl", cx, cy, w, h)
            elif nr and nt:
                _assign_best(corners, "tr", cx, cy, w, h)
            elif nl and nb:
                _assign_best(corners, "bl", cx, cy, w, h)
            elif nr and nb:
                _assign_best(corners, "br", cx, cy, w, h)

        if all(v is not None for v in corners.values()):
            src = np.float32([
                [corners["tl"][0], corners["tl"][1]],
                [corners["tr"][0], corners["tr"][1]],
                [corners["br"][0], corners["br"][1]],
                [corners["bl"][0], corners["bl"][1]],
            ])
        else:
            # ── Fallback: largest-quad via Canny ──────────────────────────────
            image_area = h * w
            blurred = cv2.GaussianBlur(gray, (7, 7), 0)
            edges = cv2.Canny(blurred, 30, 100)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            edges = cv2.dilate(edges, kernel, iterations=2)
            cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cnts = sorted(cnts, key=cv2.contourArea, reverse=True)

            sheet_quad = None
            for cnt in cnts[:15]:
                area = cv2.contourArea(cnt)
                if area < image_area * 0.10:
                    break
                peri = cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
                if len(approx) == 4:
                    sheet_quad = approx.reshape(4, 2).astype("float32")
                    break

            if sheet_quad is None:
                # Last resort: just resize the whole image
                self.original    = cv2.resize(self.original, (DST_W, DST_H))
                self.gray        = cv2.resize(self.gray,     (DST_W, DST_H))
                self.debug_image = self.original.copy()
                return

            ordered = _order_quad(sheet_quad)
            # Enforce portrait
            if float(np.linalg.norm(ordered[1] - ordered[0])) > float(np.linalg.norm(ordered[3] - ordered[0])):
                ordered = np.roll(ordered, -1, axis=0)
            src = np.float32([ordered[0], ordered[1], ordered[2], ordered[3]])

        dst = np.float32([[0, 0], [DST_W, 0], [DST_W, DST_H], [0, DST_H]])
        M = cv2.getPerspectiveTransform(src, dst)
        self.original    = cv2.warpPerspective(self.original, M, (DST_W, DST_H))
        self.gray        = cv2.warpPerspective(self.gray,     M, (DST_W, DST_H))
        self.debug_image = self.original.copy()


    # ── Preprocessing ─────────────────────────────────────────────────────────

    def _preprocess(self):
        # CLAHE: normalize uneven lighting (critical for angled / phone photos)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))  # raised from 2.5
        self.equalized = clahe.apply(self.gray)

        # Shadow-robust channel via morphological background subtraction.
        # A large dilation estimates the "paper + shadow" background by taking
        # the local maximum within a 51×51 window — this skips over small dark
        # circles (filled bubbles, ~24 px diameter) and returns the surrounding
        # brightness.  Subtracting the equalized image from this background
        # isolates only genuine dark marks: shadows darken both the pixel and
        # its surrounding background equally, so they subtract to near-zero and
        # are ignored.  Inverted so convention matches equalized: low = dark = filled.
        bg_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (51, 51))
        bg = cv2.dilate(self.equalized, bg_kernel)
        dark_marks = cv2.subtract(bg, self.equalized)   # 0 where shadow, >0 where real fill
        self.shadow_robust = cv2.bitwise_not(dark_marks) # invert: filled → low value

        blurred = cv2.GaussianBlur(self.equalized, (5, 5), 0)
        self.thresh = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 33, 7,  # C lowered 10→7: more permissive dark-pixel detection
        )

    # ── Bubble detection ──────────────────────────────────────────────────────

    def _detect_bubbles(self) -> list[tuple[int, int, int]]:
        """
        Returns list of (cx, cy, radius) for all detected bubble circles.
        Uses contour circularity first, falls back to HoughCircles.
        """
        contours, _ = cv2.findContours(self.thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        bubbles = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            # Upper bound raised to 1800: a fully-filled bubble (disc) at r≈18px
            # has area ≈ π*18² ≈ 1018 px², which the old cap of 900 was rejecting.
            if area < 150 or area > 1800:
                continue
            peri = cv2.arcLength(cnt, True)
            if peri == 0:
                continue
            circ = 4 * np.pi * area / (peri * peri)
            if circ > 0.65:  # slightly relaxed from 0.70 for imperfect fills
                (cx, cy), radius = cv2.minEnclosingCircle(cnt)
                if 6 < radius < 22:
                    bubbles.append((int(cx), int(cy), int(radius)))

        if len(bubbles) < 80:
            # Fallback: HoughCircles on CLAHE-equalized image for better contrast
            circles = cv2.HoughCircles(
                self.equalized, cv2.HOUGH_GRADIENT, dp=1.2, minDist=15,
                param1=50, param2=22,  # lower param2 = detects more (less strict)
                minRadius=7, maxRadius=22,
            )
            if circles is not None:
                bubbles = [(int(c[0]), int(c[1]), int(c[2])) for c in circles[0]]

        return bubbles

    # ── Exam Set ──────────────────────────────────────────────────────────────

    def _read_exam_set(self, bubbles: list[tuple[int, int, int]]):
        """
        Exam-set bubbles: 5 circles in a single horizontal row (A–E).
        Strategy:
          1. Strip blobs from the timing-mark strip (far-left ~8% of image).
          2. Find the y-row with the most detections.
          3. From those row bubbles, always pick the most evenly-spaced 5 via
             _pick_best_5 (even if exactly 5 found, to discard any intruder).
          4. If fewer than 5, extrapolate from detected spacing.
          5. Measure fill at each of the 5 x positions; largest darkness = answer.
        """
        if not bubbles:
            return

        h, w = self.gray.shape

        # Step 1: discard timing-mark blobs (left ~8% of image width)
        timing_cutoff = int(w * 0.08)
        bubbles = [b for b in bubbles if b[0] > timing_cutoff]
        if not bubbles:
            return

        # Step 2: find the dominant row
        y_vals = sorted(b[1] for b in bubbles)
        y_rows = _cluster_values(y_vals, gap=16)
        if not y_rows:
            return

        best_row_y, best_count = max(
            ((ry, sum(1 for b in bubbles if abs(b[1] - ry) <= 16)) for ry in y_rows),
            key=lambda t: t[1],
        )
        if best_count < 1:
            return

        row_bubbles = sorted(
            [b for b in bubbles if abs(b[1] - best_row_y) <= 16],
            key=lambda b: b[0],
        )
        row_y = int(np.mean([b[1] for b in row_bubbles]))
        avg_r = int(np.mean([b[2] for b in row_bubbles])) if row_bubbles else 12

        # Step 3 & 4: determine 5 x positions ――――――――――――――――――――――――――――――
        xs_detected = [b[0] for b in row_bubbles]

        if len(xs_detected) >= 5:
            # Always run _pick_best_5 to remove any intruder
            xs_5 = _pick_best_5(xs_detected) if len(xs_detected) > 5 else xs_detected
            xs_5 = sorted(xs_5 or xs_detected[:5])
        elif len(xs_detected) >= 2:
            # Compute typical spacing from adjacent detections; ignore large gaps
            raw_spacings = [xs_detected[i+1] - xs_detected[i] for i in range(len(xs_detected)-1)]
            min_sp = min(raw_spacings)
            typical_sp = int(np.median([s for s in raw_spacings if s < min_sp * 2.5]) or min_sp)
            # Build a consistent run starting from first detected
            run = [xs_detected[0]]
            for x in xs_detected[1:]:
                if x - run[-1] < typical_sp * 1.6:
                    run.append(x)
            spacing = typical_sp
            # Extend left/right until we have 5
            while len(run) < 5:
                run.insert(0, run[0] - spacing)
            xs_5 = sorted(run[:5])
        else:
            # Only 1 blob — try each of the 5 possible position assignments
            # Expected spacing: ~0.32in at DST_W wide for 8.5in page
            spacing = int(round(0.32 / 8.5 * DST_W))
            x_blob = row_bubbles[0][0]
            best_xs: list[int] = []
            best_gap = -1.0
            for choice in range(5):
                x_start = x_blob - choice * spacing
                cands = [x_start + i * spacing for i in range(5)]
                if cands[0] < timing_cutoff or cands[-1] > w - 20:
                    continue
                fills = [self._measure_fill(cx, row_y, avg_r) for cx in cands]
                gap = sorted(fills)[1] - min(fills)
                if gap > best_gap:
                    best_gap = gap
                    best_xs = cands
            if not best_xs:
                return
            xs_5 = best_xs

        # Step 5: measure fill at each of the 5 positions
        fills = [self._measure_fill(int(x), row_y, r=max(8, avg_r - 2)) for x in xs_5]
        darkest = min(fills)
        darkest_idx = fills.index(darkest)
        fills_sorted = sorted(fills)
        second = fills_sorted[1] if len(fills_sorted) > 1 else 255

        if darkest < 175 and (second - darkest) > 20:
            self.exam_set = CHOICES[darkest_idx] if darkest_idx < len(CHOICES) else ""
            cx_det = int(xs_5[darkest_idx])
            cv2.circle(self.debug_image, (cx_det, row_y), avg_r + 4, (255, 0, 255), 2)
            cv2.putText(self.debug_image, f"SET:{self.exam_set}",
                        (cx_det - 18, row_y - avg_r - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 255), 1)

        # Debug: draw all 5 labelled bubbles
        for i, x in enumerate(xs_5):
            cv2.circle(self.debug_image, (int(x), row_y), avg_r, (180, 0, 180), 1)
            cv2.putText(self.debug_image, CHOICES[i] if i < 5 else "?",
                        (int(x) - 5, row_y - avg_r - 3),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (180, 0, 180), 1)




    # ── Roll Number ───────────────────────────────────────────────────────────

    def _read_roll_number(self, bubbles: list[tuple[int, int, int]]):
        """
        Roll number is a 5-column × 10-row grid of bubbles.
        Each column encodes one digit (the filled row = digit 0–9).
        """
        if len(bubbles) < 20:
            return

        x_vals = sorted(b[0] for b in bubbles)
        x_clusters = _cluster_values(x_vals, gap=14)

        y_vals = sorted(b[1] for b in bubbles)
        y_rows = _cluster_values(y_vals, gap=14)

        if len(x_clusters) < 3 or len(y_rows) < 5:
            return

        # Drop phantom rows caused by the "ROLL NO." label text above the grid.
        # Those circles appear at the TOP (smallest y), so when we have too many rows
        # we remove them from the front until we have exactly 10.
        if len(y_rows) > 10:
            best = _pick_best_n(y_rows, 10)
            y_rows = best if best else y_rows[len(y_rows) - 10:]

        # Spacing-based phantom check: if the first gap is much tighter than the
        # rest, the first row is a label phantom, not a real bubble row.
        if len(y_rows) >= 3:
            spacings = [y_rows[i + 1] - y_rows[i] for i in range(len(y_rows) - 1)]
            median_sp = float(np.median(spacings))
            if spacings[0] < median_sp * 0.75:
                y_rows = y_rows[1:]

        # Keep up to 5 column x-centers and exactly 10 row y-centers
        x_centers = x_clusters[:5]
        if len(y_rows) < 10:
            # Infer missing rows from spacing
            spacing = int(np.median(np.diff(y_rows))) if len(y_rows) >= 2 else 30
            while len(y_rows) < 10:
                y_rows.append(y_rows[-1] + spacing)
        y_rows = y_rows[:10]

        digits = []
        avg_r = int(np.mean([b[2] for b in bubbles]))
        for x in x_centers:
            fills = [self._measure_fill(x, y, r=int(avg_r * 0.85)) for y in y_rows]
            darkest = min(fills)
            darkest_row = fills.index(darkest)
            median_others = float(np.median([f for i, f in enumerate(fills) if i != darkest_row]))

            if darkest < 200 and (median_others - darkest) > 25:
                digits.append(str(darkest_row))
                cv2.circle(self.debug_image, (x, y_rows[darkest_row]), avg_r, (0, 200, 255), 2)
            else:
                digits.append("0")

        self.roll_number = "".join(digits).zfill(5)

        # Draw roll-no region label
        if x_centers and y_rows:
            cv2.putText(self.debug_image, f"ROLL:{self.roll_number}",
                        (x_centers[0] - 10, y_rows[0] - 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 1)
            # Draw all roll-no bubbles faintly
            for x in x_centers:
                for y in y_rows:
                    cv2.circle(self.debug_image, (x, y), avg_r, (0, 150, 200), 1)

    # ── Answers ───────────────────────────────────────────────────────────────

    def _read_answers(self, bubbles: list[tuple[int, int, int]]):
        """
        Answers are in 4 column-groups × 25 rows × 5 choices.
        Detect column groups by clustering x, then for each group find 25 y-rows.
        """
        if not bubbles:
            return

        x_vals = sorted(b[0] for b in bubbles)
        x_clusters = _cluster_values(x_vals, gap=14)
        col_groups_x = _group_into_column_groups(x_clusters, gap_threshold=55, min_cols=3)

        if not col_groups_x:
            return

        q_num = 1
        avg_r = int(np.mean([b[2] for b in bubbles])) if bubbles else 10

        for gi, gx in enumerate(col_groups_x[:4]):
            if q_num > NUM_QUESTIONS:
                break

            x_min, x_max = min(gx) - 20, max(gx) + 20
            group_bubbles = [b for b in bubbles if x_min <= b[0] <= x_max]
            if not group_bubbles:
                continue

            y_vals_g = sorted(b[1] for b in group_bubbles)
            y_rows = _cluster_values(y_vals_g, gap=14)
            if not y_rows:
                continue

            # Infer up to 25 rows from detected spacing
            if len(y_rows) >= 2:
                spacing = int(np.median(np.diff(y_rows)))
                while len(y_rows) < 25:
                    y_rows.append(y_rows[-1] + spacing)
            y_rows = y_rows[:25]

            x_centers = gx[:5]
            if len(x_centers) < 5 and len(x_centers) >= 3:
                if len(x_centers) >= 2:
                    sp = int(np.mean(np.diff(x_centers)))
                    while len(x_centers) < 5:
                        x_centers.append(x_centers[-1] + sp)

            for y in y_rows:
                if q_num > NUM_QUESTIONS:
                    break
                if len(x_centers) < 5:
                    q_num += 1
                    continue

                fills = [self._measure_fill(x, y, r=int(avg_r * 0.85)) for x in x_centers[:5]]

                # Determine all filled bubbles (multi-bubble detection).
                # Sort indices darkest-first; iteratively check each against the
                # median of all bubbles not yet confirmed filled.
                # The 2nd+ bubble uses stricter thresholds to avoid false positives
                # from erased pencil marks (which leave faint residue).
                sorted_idxs = sorted(range(len(fills)), key=lambda i: fills[i])
                filled_idxs: list[int] = []
                for rank, idx in enumerate(sorted_idxs):
                    ref_idxs = [i for i in range(len(fills)) if i != idx and i not in filled_idxs]
                    if not ref_idxs:
                        break
                    ref_median = float(np.median([fills[i] for i in ref_idxs]))
                    abs_diff = ref_median - fills[idx]
                    ratio = fills[idx] / ref_median if ref_median > 0 else 1.0
                    # First bubble: normal thresholds. Subsequent: stricter to reject erasure residue.
                    # Thresholds calibrated for shadow_robust image (inverted background-subtraction):
                    # filled bubble ≈ 125–210, unfilled/shadow ≈ 245–255.
                    if rank == 0:
                        is_filled = fills[idx] < 215 and abs_diff > 18 and ratio < 0.84
                    else:
                        is_filled = fills[idx] < 175 and abs_diff > 35 and ratio < 0.72
                    if is_filled:
                        filled_idxs.append(idx)
                    else:
                        break  # lighter bubbles won't pass either

                if len(filled_idxs) == 1:
                    # Normal single answer
                    letter = CHOICES[filled_idxs[0]]
                    self.answers[q_num - 1] = letter
                    self.answer_bubble_data.append({
                        "q_idx": q_num - 1,
                        "x": int(x_centers[filled_idxs[0]]),
                        "y": int(y),
                        "r": int(avg_r),
                        "answer": letter,
                    })
                elif len(filled_idxs) >= 2:
                    # Multi-bubble: record all filled bubbles; answer stays "" (blank)
                    for idx in filled_idxs:
                        self.answer_bubble_data.append({
                            "q_idx": q_num - 1,
                            "x": int(x_centers[idx]),
                            "y": int(y),
                            "r": int(avg_r),
                            "answer": CHOICES[idx],
                        })

                q_num += 1

    # ── Section ROI detection ─────────────────────────────────────────────────

    def _find_section_rois(self) -> "dict | None":
        """
        Locate the three section boxes (Exam Set, Roll No., Answers) by
        detecting their solid black title bars (.bt elements).

        Key insight: use 2D erosion (width × height) so that only regions that
        are continuously dark for BOTH min_bar_w pixels horizontally AND
        min_bar_h pixels vertically survive.
          • Title bars  : ~30 px tall × >10 % page width  → survive
          • Box borders : ~3 px tall                       → eliminated
          • Timing marks: ~15 px wide                      → eliminated

        Returns {'exam_set': (x1,y1,x2,y2), 'roll_no': ..., 'answers': ...}
        or None (caller falls back to percentage splits).
        """
        h, w = self.gray.shape

        # Otsu threshold – auto-adapts to scan brightness
        _, inv = cv2.threshold(self.gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # 2D erosion: only solid dark blocks survive (box borders ~3 px are killed)
        min_bar_w = max(5, int(w * 0.08))
        min_bar_h = 10          # title bars ≈ 30 px; borders ≈ 3 px → clear separation
        kern_2d = cv2.getStructuringElement(cv2.MORPH_RECT, (min_bar_w, min_bar_h))
        wide_dark = cv2.erode(inv, kern_2d)

        # Restore blob to approximately original bar size
        restore = cv2.getStructuringElement(cv2.MORPH_RECT, (min_bar_w + 10, min_bar_h + 8))
        wide_dark = cv2.dilate(wide_dark, restore)

        num, _, stats, _ = cv2.connectedComponentsWithStats(wide_dark, connectivity=8)

        bars = []
        for i in range(1, num):
            bx, by, bw, bh, _ = stats[i]
            if (bw > w * 0.08           # wide enough to be a section bar
                    and bh < h * 0.10   # thin (not a full content region)
                    and bw / max(bh, 1) > 2.5  # distinctly bar-shaped
                    and bx > w * 0.02   # skip timing-mark strip
                    and bw < w * 0.97): # not page-spanning
                bars.append((bx, by, bx + bw, by + bh))

        if len(bars) < 3:
            return None

        bars.sort(key=lambda b: b[1])  # top → bottom

        # Group bars at the same vertical level (within 8 % of page height)
        groups: list[list[tuple]] = [[bars[0]]]
        for bar in bars[1:]:
            if bar[1] - groups[-1][0][1] < h * 0.08:
                groups[-1].append(bar)
            else:
                groups.append([bar])

        # Header group = first group with ≥ 2 bars (Exam Set + Roll No.)
        header_group = next((g for g in groups if len(g) >= 2), None)
        if header_group is None:
            return None

        header_group = sorted(header_group, key=lambda b: b[0])  # left → right
        exam_bar = header_group[0]
        roll_bar = header_group[-1]
        header_y_max = max(b[3] for b in header_group)

        # Answers bar = first wide bar below the header group
        ans_bar = None
        for g in groups:
            for bar in g:
                if bar[1] > header_y_max and (bar[2] - bar[0]) > w * 0.30:
                    if ans_bar is None or bar[1] < ans_bar[1]:
                        ans_bar = bar
        if ans_bar is None:
            return None

        # Sanity: exam bar in left half, roll bar in right half, answers in mid-page
        if exam_bar[2] > w * 0.65 or roll_bar[0] < w * 0.35:
            return None
        ans_center_y = (ans_bar[1] + ans_bar[3]) / 2
        if not (h * 0.28 < ans_center_y < h * 0.72):
            return None

        pad = max(4, int(h * 0.004))
        ans_top  = ans_bar[1]
        page_bot = h - max(4, int(h * 0.02))

        rois = {
            "exam_set": (exam_bar[0],  exam_bar[3] + pad, roll_bar[0] - pad,  ans_top - pad),
            "roll_no":  (roll_bar[0],  roll_bar[3] + pad, roll_bar[2],         ans_top - pad),
            "answers":  (ans_bar[0],   ans_bar[3] + pad,  ans_bar[2],          page_bot),
        }

        # Debug: draw detected ROI outlines on the annotated image
        colours = {"exam_set": (255, 100, 0), "roll_no": (255, 100, 0), "answers": (255, 100, 0)}
        for key, (x1, y1, x2, y2) in rois.items():
            cv2.rectangle(self.debug_image, (x1, y1), (x2, y2), colours[key], 2)

        return rois

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _measure_fill(self, cx: int, cy: int, r: int = 10) -> float:
        """
        Fill metric inside a circle on the shadow-robust image.
        Lower = darker = more filled.

        Uses morphological background-subtracted image (shadow_robust) so that
        hand shadows — which darken both the bubble and its surrounding paper
        equally — cancel out and are not mistaken for filled bubbles.
        Combines mean with 25th percentile so partial/light shading is detected.
        """
        img = getattr(self, "shadow_robust", getattr(self, "equalized", self.gray))
        h, w = img.shape
        cx, cy = int(cx), int(cy)
        if cx - r < 0 or cx + r >= w or cy - r < 0 or cy + r >= h:
            return 255.0
        mask = np.zeros((h, w), dtype="uint8")
        cv2.circle(mask, (cx, cy), r, 255, -1)
        pixels = img[mask > 0]
        if len(pixels) == 0:
            return 255.0
        mean_val = float(np.mean(pixels))
        p25_val  = float(np.percentile(pixels, 25))
        # Weight toward the darker quarter of pixels — catches partial shading
        return 0.55 * mean_val + 0.45 * p25_val

    def _build_result(self, error: str | None = None) -> dict:
        _, buf = cv2.imencode(".jpg", self.debug_image)
        annotated_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode()
        return {
            "roll_number": self.roll_number,
            "exam_set": self.exam_set,
            "answers": self.answers,
            "annotated_image": annotated_b64,
            "bubble_positions": self.answer_bubble_data,
            "img_w": DST_W,
            "img_h": DST_H,
            "error": error,
        }


# ──────────────────────────────────────────────
# Utility helpers (module-level)
# ──────────────────────────────────────────────

def _order_quad(pts: np.ndarray) -> np.ndarray:
    """Order 4 points: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    d = np.diff(pts, axis=1).flatten()
    rect[1] = pts[np.argmin(d)]
    rect[3] = pts[np.argmax(d)]
    return rect


def _assign_best(corners: dict, key: str, cx: float, cy: float, w: int, h: int):
    """Keep the candidate closest to the true corner of the image."""
    target = {"tl": (0, 0), "tr": (w, 0), "bl": (0, h), "br": (w, h)}[key]
    dist = ((cx - target[0]) ** 2 + (cy - target[1]) ** 2) ** 0.5
    if corners[key] is None or dist < corners[key][2]:
        corners[key] = (cx, cy, dist)


def _cluster_values(values: list[int], gap: int = 12) -> list[int]:
    """Cluster nearby values and return their means."""
    if not values:
        return []
    clusters = []
    current = [values[0]]
    for v in values[1:]:
        if v - current[-1] <= gap:
            current.append(v)
        else:
            clusters.append(int(np.mean(current)))
            current = [v]
    clusters.append(int(np.mean(current)))
    return clusters


def _group_into_column_groups(
    x_clusters: list[int],
    gap_threshold: int = 55,
    min_cols: int = 3,
) -> list[list[int]]:
    """
    Split x-cluster list into groups separated by large gaps.
    Each group represents one answer column (5 choice x-positions).
    """
    if not x_clusters:
        return []
    groups_raw = []
    current = [x_clusters[0]]
    for i in range(1, len(x_clusters)):
        if x_clusters[i] - x_clusters[i - 1] < gap_threshold:
            current.append(x_clusters[i])
        else:
            if len(current) >= min_cols:
                groups_raw.append(current)
            current = [x_clusters[i]]
    if len(current) >= min_cols:
        groups_raw.append(current)

    groups = []
    for g in groups_raw:
        if len(g) == 5:
            groups.append(g)
        elif len(g) > 5:
            best = _pick_best_5(g)
            if best:
                groups.append(best)
        elif len(g) >= min_cols:
            groups.append(g)
    return groups[:4]


def _pick_best_n(values: list[int], n: int) -> list[int] | None:
    """Pick n values from a sorted list with the most evenly-spaced distribution."""
    if len(values) < n:
        return None
    if len(values) == n:
        return values
    best_subset = None
    best_score = float("inf")
    for combo in combinations(range(len(values)), n):
        vals = [values[i] for i in combo]
        spacings = [vals[j + 1] - vals[j] for j in range(n - 1)]
        mean_sp = float(np.mean(spacings))
        score = float(sum((s - mean_sp) ** 2 for s in spacings))
        if score < best_score:
            best_score = score
            best_subset = vals
    return best_subset


def _pick_best_5(values: list[int]) -> list[int] | None:
    """Pick 5 values from a list with most evenly-spaced distribution."""
    best_subset = None
    best_score = float("inf")
    for combo in combinations(range(len(values)), 5):
        vals = [values[i] for i in combo]
        spacings = [vals[j + 1] - vals[j] for j in range(4)]
        mean_sp = float(np.mean(spacings))
        score = float(sum((s - mean_sp) ** 2 for s in spacings))
        if score < best_score:
            best_score = score
            best_subset = vals
    return best_subset


def _in_roi(bubble: tuple, roi: tuple) -> bool:
    """Return True if bubble center (x, y, r) lies inside the ROI (x1,y1,x2,y2)."""
    x, y = bubble[0], bubble[1]
    x1, y1, x2, y2 = roi
    return x1 <= x <= x2 and y1 <= y <= y2


def _error_result(message: str) -> dict:
    return {
        "roll_number": "00000",
        "exam_set": "",
        "answers": [""] * NUM_QUESTIONS,
        "annotated_image": None,
        "bubble_positions": [],
        "img_w": DST_W,
        "img_h": DST_H,
        "error": message,
    }
