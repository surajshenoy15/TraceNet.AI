# TraceNet AI MOSINT connector setup

This connector runs MOSINT as a separate command-line process from the FastAPI backend.
Use it only for owned emails, consent-based tests, or legally authorized investigations.

## 1. Install MOSINT

```bash
go install -v github.com/alpkeskin/mosint/v3/cmd/mosint@latest
```

Make sure the Go bin directory is in your PATH so the `mosint` command works.

## 2. Configure MOSINT

```bash
cp .mosint.example.yaml .mosint.yaml
```

On Windows PowerShell:

```powershell
copy .mosint.example.yaml .mosint.yaml
```

Add only the API keys that you lawfully own. Keep the file private.

## 3. Enable the connector

In `.env`:

```env
ENABLE_MOSINT=true
MOSINT_BINARY=mosint
MOSINT_CONFIG_PATH=.mosint.yaml
MOSINT_TIMEOUT_SECONDS=90
MOSINT_STORE_RESULTS=true
```

## 4. Run backend

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 5. API endpoint

```http
POST /cases/{case_id}/email-osint/mosint
```

Body:

```json
{
  "email": "test@example.com",
  "authorized": true,
  "persist": true
}
```

The backend redacts credentials, tokens, hashes, raw leak fields, and oversized raw values before returning or storing results.
