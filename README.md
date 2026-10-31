# SafeHer — Safety That Moves With You

> Hackathon Project: Graviton (first-Hackathon)  
> Built with 💜 for women, everywhere.

SafeHer is a comprehensive women's safety ecosystem combining an AI-powered sound detector, an instant one-tap SOS emergency system, live browser GPS tracking with OpenStreetMap Leaflet visualization, and real-time emergency alert dispatching (SMS and Email) to designated trusted contacts and community volunteers.

---

## 🌟 Key Features

### 1. 🚨 Functional SOS Emergency System
- **One-Tap Manual SOS**: Immediate panic trigger from the navigation header, the hero section, or the emergency dashboard.
- **10-Second Safety Countdown**: Audio blip beeps and animated visual countdown allowing false alarms to be cancelled with a single tap.
- **Immediate Alert Dispatch**: Sends SMS (Twilio) and rich Email (Resend) notifications containing the victim's name, timestamp, trigger source, and private live-tracking URL.
- **Duplicate Suppression & Cooldown**: Intelligent debounce logic prevents duplicate alerts within a 90-second window.
- **Delivery Status & Retry**: Real-time delivery status tracking (Delivered, Sent, Simulated, Failed) with an in-app retry button for failed dispatches.
- **Safe Resolution**: Users can mark themselves safe at any time, which automatically terminates GPS tracking and sends a "Safe Now" follow-up SMS to contacts.

### 2. 🎙️ AI Scream & Distress Sound Detection
- **On-Device Audio Classification**: Classifies live microphone input using Google MediaPipe Tasks Audio and YAMNet.
- **Expanded Distress Categories**: Accurately recognizes screams, yells, shouts, shrieks, distress calls, crying, sobbing, and gunshots.
- **False-Positive Mitigation**: Real-time RMS audio energy gating (`rms >= 0.035`) ensures silence or soft ambient breathing never triggers an alert.
- **Sliding Confidence Window**: Requires 3 hits above the sensitivity threshold within the last 4 analysis frames (~2s).
- **User-Controlled Sensitivity**: Adjustable threshold (0.3 to 0.8) saved in local preferences.
- **100% On-Device & Private**: Microphone audio is processed entirely in the browser via Web Audio Worklet; zero audio bytes are ever uploaded or recorded.

### 3. 📍 Live GPS & Interactive Map
- **High-Accuracy Geolocation**: Uses browser `navigator.geolocation.watchPosition` to track real-time coordinates, heading, and speed during active emergencies.
- **Interactive Leaflet / OpenStreetMap**: Custom neo-brutalist map component with pulsing user marker, accuracy radius ring, and continuous path trail.
- **Private Shareable Link**: Secure, unguessable tracking URL (`/track?token=...`) allows contacts to monitor location in real time without login.
- **Help Near You**: Automatically finds the closest police stations and hospitals within 4 km using OpenStreetMap / Overpass / Nominatim APIs.

### 4. 🛡️ Trusted Circle (Emergency Contacts Management)
- **Contact Management**: Add, edit, and delete multiple trusted emergency contacts (Mother, Father, Partner, Roommate, Campus Security, etc.).
- **Strict Validation**: Validates international and Indian phone numbers and email addresses.
- **Primary Contact Flag**: Mark a primary responder to receive priority alerts.
- **Test Alert Dispatch**: Send one-click test SMS and email notifications to verify contact details before an emergency happens.

---

## 🛠️ Architecture & Technologies

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, Shadcn UI primitives.
- **Mapping**: Leaflet, OpenStreetMap tiles.
- **Audio Processing**: Web Audio API (`AudioContext`, `AudioWorkletNode`, `ScriptProcessorNode`), Google MediaPipe Tasks Audio YAMNet.
- **Sound Synthesis**: Synthesized Web Audio siren (720Hz sawtooth LFO carrier) and countdown beeps (zero external audio file dependency).
- **Backend / Function**: Compatible with both Node.js (local dev & testing) and Deno (Qoder Sites / Supabase Edge Functions).
- **Database**: Supabase PostgreSQL with in-memory fallback fixture (`dev/fake-supabase.mjs`) for local development without credentials.
- **Notifications**: Twilio (SMS / WhatsApp) & Resend (Email), with verified graceful simulation when credentials are omitted.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 22.12 or later (Node 22.x or 24.x supported).
- npm (bundled with Node).

### 1. Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/nikhilmishra3066-dev/first-Hackathon.git
cd first-Hackathon
npm install
```

### 2. Environment Variables
Create a `.env` file in the project root if you want to configure real external notification providers (optional; SafeHer runs in verified simulation mode if omitted):

```env
# Twilio SMS Configuration (Optional)
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Resend Email Configuration (Optional)
RESEND_API_KEY=re_XXXXXXXXXXXXXXXXXXXXXXXX
ALERT_FROM_EMAIL=alerts@safeher.app

# Supabase Production Database (Optional - fake-supabase used locally)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Running Locally

#### Start the Backend Function (Node.js):
In terminal 1:
```bash
npm run dev:node-function
```
*The local function runs on `http://127.0.0.1:8000` with the stubbed Overpass and fake database.*

#### Start the Frontend Dev Server:
In terminal 2:
```bash
npm run dev
```
Open `http://127.0.0.1:5173` in your browser.

---

## 🧪 Testing the Application

### 1. Automated Backend Test Suite
Run the end-to-end backend test suite:
```bash
npm run test:backend
```
Verifies:
- Ping health check and provider capabilities.
- Contact CRUD (Add, List, Update, Delete).
- Test alert dispatch (SMS / Email simulation and provider verification).
- SOS emergency trigger with duplicate suppression.
- Real-time location updates.
- Public tracking token resolution.
- Emergency resolution and follow-up notifications.
- User preferences persistence.

### 2. TypeScript & Build Verification
Run the production build:
```bash
npm run build
```
Checks:
- `tsc --noEmit` (strict TypeScript validation).
- Vite production asset bundling.

---

## 🌐 Emergency Workflow Walkthrough

1. **Activation**:
   - **Manual**: Click **"SOS Mode"** in the top navigation or **"🚨 One-tap SOS"** in the hero section.
   - **Voice / Sound**: Click **"Live demo"** -> **"Start listening"**; scream or click **"Simulate scream"**.
2. **Cancellation Window**:
   - A 10-second timer begins with audible soft beeps.
   - Click **"I'm OK — Cancel SOS"** to dismiss a false alarm.
3. **Dispatch & Tracking**:
   - The wailing siren starts.
   - GPS coordinates are fetched and locked.
   - SMS and Email alerts are immediately dispatched to your Trusted Circle with a live tracking link.
   - The interactive Leaflet OpenStreetMap displays your current position and coordinates.
4. **Responder View**:
   - Responders open the tracking link (`/track?token=...`) to view real-time location and path updates without signing in.
5. **Resolution**:
   - Click **"I Am Safe Now (End SOS)"** when the emergency is over.
   - Siren stops, location watching ceases, and a "Safe Now" follow-up SMS is dispatched to contacts.

---

## 🛡️ Security & Privacy

- **Zero Audio Storage**: Microphones are processed exclusively in browser memory. No voice or background audio is ever saved or sent across the network.
- **Private Location Sharing**: Coordinates are only shared during an active emergency session and accessible only through a high-entropy 24-character token.
- **Credential Protection**: All third-party secrets (Twilio, Resend, database keys) are strictly contained on the backend and never bundled into frontend client code.
- **Rate Limiting**: Sliding-window rate limiters guard SOS triggers and notification endpoints against abuse and denial-of-service.

---

## ⚠️ Known Limitations & Device Notes

- **Microphone Permissions**: Web Audio Worklets require HTTPS or `localhost`/`127.0.0.1`. In browser settings, ensure microphone access is granted.
- **Hardware Sirens**: Web Audio siren synthesis requires user interaction before the browser will unmute audio.
- **Emergency Services Notice**: SafeHer alerts personal trusted contacts and community volunteers. It does not replace direct dialing of official emergency lines (112, 100, 108).
