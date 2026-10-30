# Math Formula OCR

Formula image to LaTeX / Word-linear text web tool.

## Run

```powershell
npm install
copy .env.example .env
npm start
```

Open:

```text
http://localhost:3002
```

`PORT` comes from `.env` and defaults to `3000` when unset.

## OCR Modes

### API mode

```env
OCR_PROVIDER=api
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OCR_MODEL=qwen-vl-plus
```

### Local mode

```env
OCR_PROVIDER=local
LOCAL_OCR_PYTHON=python
LOCAL_OCR_SCRIPT=ocr/local_ocr.py
```

`ocr/local_ocr.py` is a placeholder. Replace it with a real local formula OCR model such as Pix2Text, pix2tex, or UniMERNet.

## Security

Never commit `.env`. Use `.env.example` for public configuration samples.

## Recognition output

The API returns `latex`, `word`, `result`, plus `packages` (package names) and
`notes` (compilation advice and recognition uncertainties). Older responses with
only `latex` and plain LaTeX responses remain supported, with empty metadata.
Package suggestions are model-generated and should be checked before use.

LaTeX output is a math fragment without outer math delimiters. Put it inside a
math environment in your document. The prompt asks the model to preserve reading
order, equation groups and source line breaks rather than redesign the layout.
This improves instructions but does not guarantee recognition accuracy.

The image panel scrolls independently to show long images at a readable width.
The result is editable source text; no formula rendering or TeX compiler is added.
LaTeX metadata is shown separately and is not included when copying the formula.

## Typesetting notes

The returned value is a math fragment, so it has to sit inside a math environment
(`\[ ... \]`, `equation`, `align`, ...). Two failures are common when compiling it.

**`Misplaced alignment tab character &`** means the fragment is not inside an
alignment environment, or the document does not load `amsmath`. Without
`amsmath`, `\begin{aligned}` is undefined, LaTeX keeps processing the text and
reports the error once per `&`. Load `\usepackage{amsmath}` and keep the fragment
in math mode. The server normalizes the two cases it can prove: `\&` inside
`aligned`/`cases`/`matrix` is turned back into `&`, and a fragment that contains
`&` without any alignment environment is wrapped in `aligned`.

**Circled numbers such as ①** (U+2460–U+24FF) render as nothing under `ctex`.
xeCJK only routes characters it classifies as CJK to the CJK font; this block is
not part of its default ranges, so the glyph is requested from the Latin font,
which does not have it. LaTeX does not raise an error — it only writes
`Missing character` to the log, and the character silently disappears from the
output. Declaring the block fixes it, because the CJK font usually does contain
these glyphs:

```latex
\xeCJKDeclareCharClass{CJK}{"2460->"24FF}
```

Writing the number as `\textcircled{1}` also works and does not depend on the
font. Whenever a result contains such a character, the server appends the same
hint to `notes`.
