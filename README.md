# 💰 Budget Tracker

**Live app: https://budget-tracker-two-gamma.vercel.app**

A personal budget tracker app you can use right from your phone or browser — no downloads needed. Track your income, monthly bills, credit cards, and everyday expenses all in one place.

---

## What Can It Do?

- **Track your income** — add your salary or any other money coming in
- **Manage monthly bills** — list recurring bills (rent, Netflix, utilities) and mark them as paid
- **Credit card tracking** — keep track of what you owe on each card and when payments are due
- **Log expenses** — record daily spending manually or by scanning a receipt photo
- **Monthly view** — switch between months and carry your recurring bills over automatically
- **PIN protection** — your data is secured with a 4-digit PIN (and optional fingerprint/face unlock)
- **Works offline** — once opened, the app works even without an internet connection

---

## How to Use It

### First Time Opening
When you open the app for the first time, it will ask you to **create a 4-digit PIN**. This keeps your financial data private. You'll need this PIN every time you open the app.

---

### The 5 Main Sections

#### 📊 Overview
Your financial summary for the month at a glance:
- Total income received
- How much you've paid in bills
- Credit card payments made
- Other expenses
- How much money you have **remaining**

#### 📋 Bills
Add your recurring monthly bills here (e.g. rent, electricity, internet).
- Tap **+ Add** to create a bill
- Swipe a bill **left** to edit or delete it
- Tap the **circle button** on the right to mark a bill as paid — it will ask how much you paid and which account it came from

#### 💳 Cards
Track your credit card balances and payments.
- Tap **+ Add** to add a card
- Enter the amount due, minimum due, and due date
- Mark a card as paid when you've made a payment
- You can also **upload a photo of your statement** and the app will try to read the details automatically

#### 🧾 Expenses
Record your day-to-day spending.
- Tap **Scan Receipt** to take or upload a photo of a receipt — the app will try to read the store name and amount automatically
- Tap **Manual Entry** to type in an expense yourself
- Swipe left on any expense to edit or delete it

#### ⚙️ Settings
- **Change PIN** — update your 4-digit PIN
- **Biometric Unlock** — enable fingerprint or face ID (if your device supports it)
- **Lock App** — return to the PIN screen
- **Customize Lists** — edit the categories, income sources, and payment methods to match your own setup
- **Reset PIN** — clears your PIN so you can set a new one

---

### Switching Between Months
At the top of the screen you'll see the current month. Tap **+ New Month** to start a new month — your recurring bills will automatically carry over, and expenses/payments will reset to zero.

---

## Installing It on Your Phone (Optional)

This app can be installed on your phone's home screen like a regular app — no App Store needed.

**On iPhone (Safari):**
1. Open **https://budget-tracker-two-gamma.vercel.app** in Safari
2. Tap the **Share** button (the square with an arrow pointing up)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **Add**

**On Android (Chrome):**
1. Open **https://budget-tracker-two-gamma.vercel.app** in Chrome
2. Tap the **three dots** menu in the top right
3. Tap **"Add to Home Screen"** or **"Install App"**
4. Tap **Install**

---

## A Note on Your Data

All your data is stored **on your device only** — nothing is sent to any server. This means:
- Your financial information stays private
- If you clear your browser data or uninstall the app, your data will be lost
- There is no account or cloud backup (yet)

---

## Running It Locally (For Developers)

If you want to run this on your own computer:

```bash
# 1. Clone the project
git clone https://github.com/TommyCabrera/budget-tracker.git

# 2. Go into the folder
cd budget-tracker

# 3. Install dependencies
npm install

# 4. Start the app
npm run dev
```

Then open **http://localhost:5173** in your browser.

To build for production:
```bash
npm run build
```
