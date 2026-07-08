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
