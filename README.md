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
http://localhost:3012
```

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
