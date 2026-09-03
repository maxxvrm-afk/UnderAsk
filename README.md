# UnderAsk

Upload this project to GitHub, import it in Vercel, then add:
- OPENAI_API_KEY
- OPENAI_DEAL_MODEL=gpt-5.6-luna (optional)

The search route:
- uses OpenAI Responses API + web_search
- returns max 4 deals
- caps output at 2200 tokens
- retries 429s automatically
- calculates ROI/profit/score deterministically on the server
- never needs your API key in the frontend
