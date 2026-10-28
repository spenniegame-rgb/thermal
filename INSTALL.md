# Install Thermal on your iPhone

Thermal comes two ways. Pick one.

| | Web app | iPhone app |
|---|---|---|
| Setup | 30 seconds, no computer | ~15 minutes once, needs a Windows PC or Mac |
| Rest-timer alert while you're in another app | Not reliable | Yes |
| Keeps working | Always | Needs re-signing every 7 days (automatic if set up below) |

## Option A — web app (easiest)

1. Open **https://thermal-workout.netlify.app** in **Safari**.
2. Tap **Share → Add to Home Screen**.

Done. It opens full-screen from its icon and works offline.

## Option B — iPhone app (free Apple ID)

You install the app file with a free tool called **Sideloadly**, signed with
your own Apple ID. A free Apple ID signs apps for 7 days; Sideloadly can
renew that automatically.

### 1. On your computer

**Windows**
1. If you have iTunes or iCloud from the **Microsoft Store**, uninstall them.
2. Install **iTunes** and **iCloud** from Apple's website (the non-Store versions).
3. Install **Sideloadly** from **sideloadly.io**.

**Mac**
1. Install **Sideloadly** from **sideloadly.io**. (No iTunes needed.)

### 2. Install

1. Download **Thermal.ipa** from the latest release:
   **https://github.com/spenniegame-rgb/thermal/releases/latest**
2. Plug your iPhone into the computer with a cable. Unlock it and tap
   **Trust** if asked.
3. Open Sideloadly. Drag **Thermal.ipa** onto it.
4. Type your Apple ID email in **Apple account**. Leave the advanced options
   as they are, and make sure **automatic refresh** is ticked if Sideloadly offers it.
5. Click **Start**. Enter your Apple ID password and the code that appears on
   your phone.
6. On the iPhone, turn on **Developer Mode**: **Settings → Privacy & Security**,
   scroll to the very bottom (under **Security**) → **Developer Mode** → on →
   **Restart**, then tap **Turn On** after it restarts. The switch only appears
   once an app like Thermal has been installed, so it won't be there before step 5.
7. **Settings → General → VPN & Device Management** → tap your Apple ID → **Trust**.
8. Open **Thermal**. The first time you tick a set, allow notifications so the
   rest timer can alert you.

### 3. Keep it renewing automatically

- **Windows:** with the phone plugged in, open **iTunes → the phone icon →
  Summary → Options → tick "Sync with this iPhone over Wi-Fi" → Apply**.
- **Mac:** **Finder → your iPhone → General → tick "Show this iPhone when on Wi-Fi" → Apply**.

Now Sideloadly's background helper renews Thermal every few days whenever your
phone and computer are on the **same Wi-Fi** and the computer is awake. If you're
away for more than a week the app won't open until you're back home and it
renews (or you plug in and click Start again). **Your data is kept either way.**

### Updating to a new version

Download the new **Thermal.ipa** and install it the same way, **with the same
Apple ID**. It installs over the old one and keeps all your workouts.

### Moving your data from the web app

1. In the web app: **Plan → Back up everything → Save to Files**.
2. In the iPhone app: **Plan → Import a file** → pick that backup.

### Good to know

- Free Apple IDs can have **3** sideloaded apps at a time.
- If Sideloadly says you've hit **10 App IDs in 7 days**, wait a few days.
- Your workouts stay on your phone. Nothing is uploaded anywhere.
