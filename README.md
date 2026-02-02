# VRChat Plex Status

Automatically show what you're watching or listening to on Plex in your VRChat status.

> This project was generated with the help of [Claude Code](https://claude.ai/claude-code) by Anthropic.
>
> Inspired by [Mickman1/plex-osc](https://github.com/Mickman1/plex-osc).

---

## What Does This Do?

When you play something on Plex (a movie, TV show, or music), this app automatically updates your VRChat status to show what you're playing. When you stop playing, it restores your original status.

**Example statuses:**
- `Inception` (movie)
- `Breaking Bad S1E5` (TV show)
- `Bohemian Rhapsody Queen | A Night at the Opera` (music)

---

## Quick Setup (Recommended)

**Just double-click `Setup.cmd` and follow the prompts!**

The setup wizard will:
1. ✅ Install Node.js automatically (via winget)
2. ✅ Install all required dependencies
3. ✅ Create a launcher script
4. ✅ Optionally add to VRCX auto-startup
5. ✅ Optionally create a Desktop shortcut
6. ✅ Guide you through Plex and VRChat login

That's it! After setup, just double-click the Desktop shortcut or let VRCX start it automatically.

---

## Requirements

- **Windows 10/11** (for the setup wizard)
- **A Plex Media Server** running on your network
- **A VRChat Account**

Node.js will be installed automatically by the setup wizard if needed.

---

## Manual Setup Guide

<details>
<summary>Click to expand manual installation steps</summary>

### Step 1: Download Node.js

1. Go to https://nodejs.org/
2. Click the big green button that says **"LTS"** (Long Term Support)
3. Run the installer you downloaded
4. Click "Next" through all the steps (default settings are fine)
5. Click "Install" and wait for it to finish
6. Click "Finish"

**To verify it installed correctly:**
1. Press `Windows + R` on your keyboard
2. Type `cmd` and press Enter
3. In the black window that opens, type: `node --version`
4. You should see something like `v20.x.x` - this means it worked!

### Step 2: Download This Project

**Option A: Download as ZIP (Easiest)**
1. Click the green "Code" button at the top of this page
2. Click "Download ZIP"
3. Find the downloaded ZIP file and extract it
4. Remember where you extracted it (e.g., `C:\Users\YourName\Downloads\VRChatPlexStatus`)

**Option B: Using Git (If you have Git installed)**
```bash
git clone https://github.com/YOUR_USERNAME/VRChatPlexStatus.git
```

### Step 3: Install Dependencies

1. Open a terminal/command prompt in the project folder:
   - **Windows:** Open the folder, click in the address bar, type `cmd`, press Enter
   - **Or:** Open Command Prompt, type `cd ` (with a space), then drag the folder into the window and press Enter

2. Run this command:
   ```bash
   npm install
   ```

3. Wait for it to finish (you'll see some text scrolling, this is normal)

### Step 4: Run the App

1. In the same terminal window, type:
   ```bash
   node index
   ```

2. Press Enter

### Step 5: Authorize Plex

1. A browser window should open automatically to Plex
2. If it doesn't open, copy the link shown in the terminal and paste it in your browser
3. Log in to your Plex account (if you aren't already)
4. Click **"Allow"** to authorize the app
5. Go back to the terminal - it should say "Authorization successful!"

### Step 6: Select Your Plex Server

1. You'll see a list of your Plex servers (numbered)
2. Type the number of the server you want to use
3. Press Enter

**If your server isn't listed:**
- Choose "Enter address manually"
- Type your server's address, for example: `http://192.168.1.100:32400`
- Press Enter

### Step 7: Log in to VRChat

1. Type your VRChat username or email
2. Press Enter
3. Type your password (it won't show as you type - this is normal for security)
4. Press Enter
5. If you have 2FA enabled, enter your code when prompted

### Step 8: Done!

You should see: **"Ready! Monitoring Plex sessions..."**

Now play something on Plex and check your VRChat status - it should update automatically!

**To stop the app:** Press `Ctrl + C` in the terminal

</details>

---

## Running the App Again

After the first setup, you can run the app by:

- **Double-click** the Desktop shortcut (if you created one)
- **VRCX** will auto-start it (if you enabled that option)
- **Or** open a terminal and run: `node index`

Your credentials are saved, so you won't need to log in again!

---

## Command Options

| Command | What It Does |
|---------|--------------|
| `node index` | Run normally |
| `node index --short` | Shorter status (hides album name for music) |
| `node index --reset-plex` | Log out of Plex and re-authorize |
| `node index --reset-vrchat` | Log out of VRChat and re-login |
| `node index --reset-all` | Clear all saved logins |
| `node index --help` | Show all options |

---

## Troubleshooting

### "Failed to connect to Plex server" or "fetch failed"

This usually means the app can't reach your Plex server. Try these fixes:

1. **Make sure Plex is running** - Check that your Plex Media Server is actually running

2. **Use HTTP instead of HTTPS** - When entering your server address manually, try:
   ```
   http://192.168.1.100:32400
   ```
   (Replace with your actual IP address)

3. **Find your correct IP address:**
   - Open Plex Web (app.plex.tv)
   - Go to Settings > Server > Remote Access
   - Look for your local IP address

4. **Reset and try again:**
   ```bash
   node index --reset-plex
   ```

### "Session expired" or can't log into VRChat

Reset your VRChat session:
```bash
node index --reset-vrchat
```

### Status not updating in VRChat

- Make sure you're playing media on the **admin account** (the main Plex account)
- The polling happens every 0.5 seconds by default
- Check that the terminal shows "Status:" messages when you play something

### "node" is not recognized

Node.js isn't installed correctly. Go back to Step 1 and reinstall it.

---

## Where Are My Files Stored?

### Credentials (private - gitignored)

| File | Contains |
|------|----------|
| `config.json` | Plex token and server address |
| `vrchat-session.json` | VRChat session |

These files are only on your computer and are not shared with anyone.

### Files Created by Setup.cmd

| File | Location | Purpose |
|------|----------|---------|
| `VRChatPlexStatus.ps1` | Project folder | PowerShell launcher script |
| `VRChatPlexStatus.cmd` | `%AppData%\VRCX\Startup\` | VRCX auto-startup (optional) |
| `VRChat Plex Status.cmd` | Desktop | Desktop shortcut (optional) |

To delete all saved credentials:
```bash
node index --reset-all
```

---

## Uninstalling

1. Stop the app if it's running (`Ctrl + C`)
2. Delete the Desktop shortcut (if created)
3. Delete `%AppData%\VRCX\Startup\VRChatPlexStatus.cmd` (if created)
4. Delete the project folder
5. (Optional) Uninstall Node.js from Windows Settings > Apps

---

## Credits

- Generated with [Claude Code](https://claude.ai/claude-code) by Anthropic
- Inspired by [Mickman1/plex-osc](https://github.com/Mickman1/plex-osc)

## License

ISC
