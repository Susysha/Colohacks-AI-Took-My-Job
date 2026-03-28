# Colohacks-AI-Took-My-Job
# MediRelay 
### Structured Inter-Hospital Patient Handoff Application

> Built for App Development Track | SDG 3: Good Health & Well-Being

---

## The Problem

When a patient is transferred between hospitals, their critical information travels in a paper folder — discharge summaries, medication lists, handwritten referral notes. The receiving doctor, who has never seen this patient, must absorb all of this in minutes, often in an emergency, from handwriting they may not be able to read.

**Patients are harmed by this every day.**

MediRelay replaces the paper folder with a structured, scannable, fast-access digital handoff that any receiving doctor can review in under 90 seconds.

---

## What It Does

**Sending Side (Mobile App)**
- Doctor fills a fixed-structure transfer form — no ambiguity, every field defined
- AI formats rough clinical notes into a clean structured summary
- App generates a QR code encoding the full transfer record
- A 60-second Voice Handoff Briefing is generated for the phone call before the patient arrives
- Transfer Criticality Badge (LOW / MEDIUM / HIGH / CRITICAL) auto-assigned from vitals and medication data

**Receiving Side**
- Scan QR code → full record opens instantly
- Critical information always visible first: Known Allergies, Must-Not-Stop Medications, Reason for Transfer
- Patient Query Assistant: ask natural language questions about the patient, answered strictly from the transfer record
- Mark as Reviewed with arrival note and timestamp
- Transfer Timeline showing patient's movement history across facilities

---

## Key Features

| Feature | Description |
|---|---|
| Structured Transfer Form | Fixed fields, no free-form ambiguity |
| Big Three Always First | Allergies, critical meds, transfer reason — above the fold always |
| QR Code Generation | Full record encoded, scannable on any device |
| Criticality Badge | Auto-scored from vitals and medications |
| AI Clinical Summary | Rough notes → structured 200-word summary via Claude API |
| Patient Query Assistant | Grounded Q&A strictly from transfer record |
| Voice Handoff Briefing | 60-second spoken brief generated for phone handoffs |
| Transfer Timeline | Visual dot timeline of patient's inter-hospital journey |
| Offline Storage | Records saved locally, accessible without internet |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native + Expo |
| Local Storage | AsyncStorage / expo-sqlite |
| QR Generation | react-native-qrcode-svg |
| QR Scanning | expo-camera |
| AI Features | Anthropic Claude API (claude-sonnet-4) |
| Text-to-Speech | expo-speech |
| Navigation | React Navigation (Stack) |

---

## Screens

```
HomeScreen
├── Create Transfer Record → TransferFormScreen
└── Scan QR to View Record → ReceivingViewScreen

TransferFormScreen
└── On Submit → SummaryQRScreen

SummaryQRScreen
└── QR Code + Criticality Badge + Voice Briefing

ReceivingViewScreen
└── Big Three + Full Record + Query Assistant + Timeline
```

---

## Getting Started

### Prerequisites
- Node.js installed
- Expo Go app on your phone (Play Store / App Store)
- Anthropic API key (for AI features)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/MediRelay.git
cd MediRelay

# Install dependencies
npm install

# Start the app
npx expo start
```

Scan the QR code in terminal using Expo Go on your phone.

### Environment Setup

Create a `.env` file in the root:
```
ANTHROPIC_API_KEY=your_api_key_here
```

---

## AI Features in Detail

### 1. Clinical Summary Formatter
Doctor types rough notes → taps "Format my notes" → Claude structures it into sections: `PRIMARY CONCERN`, `CLINICAL TRAJECTORY`, `MEDICATION NOTE`, `TRANSFER RATIONALE`. Doctor reviews and confirms before saving.

### 2. Patient Query Assistant
After reviewing the record, the receiving doctor can ask questions like:
- *"Can this patient receive ibuprofen?"*
- *"Why was bisoprolol stopped?"*

Claude answers using **only the transfer record** — no hallucination, fully grounded.

### 3. Voice Handoff Briefing
Generates a 60-second verbal briefing the sending doctor reads over the phone. Covers: criticality level, diagnosis, allergies, must-not-stop meds, transfer reason, one critical action item. Played aloud via expo-speech.

---

## Criticality Scoring Logic

| Level | Conditions |
|---|---|
| CRITICAL | SpO2 < 90 OR allergy present AND 3+ medications |
| HIGH | HR > 120 or < 50 OR more than 4 medications |
| MEDIUM | Abnormal vitals OR pending investigations present |
| LOW | All else |

---

## SDG Alignment

**SDG 3 — Good Health and Well-Being**

MediRelay directly addresses patient safety gaps in inter-hospital transfers — a known source of preventable adverse events in under-resourced healthcare systems. By structuring the handoff and surfacing critical information first, it reduces medication errors, missed allergies, and delayed treatment decisions.

---

## Team

Built at ColoHacks DBIT · App Development Track

