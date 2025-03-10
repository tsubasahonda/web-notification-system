curl -X POST http://localhost:4000/api/send-notification \
    -H "Content-Type: application/json" \
    -d '{"title":"Test from CURL","body":"This is a test notification sent from curl command", "url":"https://www.google.com"}'