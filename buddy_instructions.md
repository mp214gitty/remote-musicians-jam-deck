# Instructions for Your Buddy 🎸

To join the jam session, follow these steps:

1. **Clone the Project**
   - Open Antigravity and select **"Clone a repository from GitHub"** on the welcome screen.
   - Use this URL: `https://github.com/mp214gitty/remote-musicians-jam-deck.git`

2. **Connect to the Live Server**
   - Open the file: `client/src/lib/NetworkManager.ts`
   - Locate **Line 4**:
     ```typescript
     const WS_URL = 'ws://localhost:8080';
     ```
   - Change it to the new public server IP:
     ```typescript
     const WS_URL = 'ws://136.113.32.114:8080';
     ```

3. **Start Playing**
   - Open the terminal in Antigravity and start the app:
     ```bash
     cd client
     npm install
     npm run dev
     ```

Happy Jamming! 🚀
