# Bib Projekt - Book Reading Checklist App with Backend

## Prerequisites

Before running this application, you need to install **Node.js**. This will also install `npm` (Node Package Manager).

### Installing Node.js

1. Visit https://nodejs.org/
2. Download the **LTS (Long Term Support)** version 
3. Run the installer and follow the installation steps
4. After installation, verify by opening a terminal and typing:
   ```
   node --version
   npm --version
   ```

## Setup & Running the Application

### 1. Install Backend Dependencies

Open a terminal/PowerShell and navigate to the backend folder:

```powershell
cd "c:\Users\Johannes\Downloads\Bib Projekt\backend"
npm install
```

This installs all required packages like Express, SQLite3, CORS, and body-parser.

### 2. Start the Backend Server

In the same terminal, run:

```powershell
npm start
```

You should see output like:
```
🚀 Server running on http://localhost:3000
📚 Open the app at http://localhost:3000
```

### 3. Open the Application

Open your web browser and go to:
- **http://localhost:3000**

The server will serve the frontend files and handle all account management through the API.

## How It Works

### Frontend & Backend Communication

- **Frontend** (HTML/CSS/JavaScript in root folder): Handles UI and user interactions
- **Backend** (Node.js/Express in `backend/` folder): Manages accounts and data via REST API
- **Database** (SQLite): Stores account data persistently on the server

### Account Management

- **Create Account**: Users can register new accounts via the UI
- **Login/Logout**: Users authenticate via the API
- **Admin Features**: Admins can see all accounts created on the server (not just their device)

### Multi-Device Support

Unlike the old localStorage system, accounts are now stored **centrally on the server**. This means:
- ✅ Accounts created on one device are visible on all other devices
- ✅ Admins can see all user accounts across all devices
- ✅ User data syncs across devices

## Troubleshooting

### Port 3000 Already in Use

If you get an error like "Port 3000 is already in use", either:
1. Close other applications using port 3000
2. Or modify the port in `backend/server.js` (change `const PORT = 3000;`)

### Database Issues

If you want to reset the database and start fresh, delete the `backend/accounts.db` file and restart the server. It will recreate the database automatically.

### CORS Errors

If you see CORS errors in the browser console, make sure:
1. The backend is running on `http://localhost:3000`
2. The frontend is accessing it via the same URL

## Project Structure

```
Bib Projekt/
├── index.html              # Main page
├── account.html            # Account management page
├── borrow.html             # Borrow books page
├── read.html               # Reading list page
├── script.js               # Main application logic (uses API)
├── styles.css              # Application styling
├── translate.js            # Translation utilities
├── openlibrary-extra.js    # Library integration
├── backend/                # Node.js/Express backend
│   ├── server.js           # Main server file
│   ├── db.js               # SQLite database module
│   ├── package.json        # Dependencies
│   └── accounts.db         # SQLite database (created automatically)
└── README.md               # This file
```

## Next Steps

1. Make sure Node.js is installed
2. Install backend dependencies: `npm install`
3. Start the server: `npm start`
4. Open http://localhost:3000 in your browser
5. Create an account and test multi-device synchronization!
