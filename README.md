# 🎵 Carnatic Music Notation Editor

A simple, user-friendly web application for creating, editing, saving, and exporting Carnatic music notation digitally.

## 📌 About the Project

The **Carnatic Music Notation Editor** is a client-side web application designed to simplify the process of writing and organizing Carnatic music notation. It allows users to enter swaras and corresponding sahitya (lyrics), organize notation into structured sections, and generate formatted notation sheets in PDF format.

The application aims to provide an accessible and economical alternative to specialized desktop notation software, particularly for students, teachers, and musicians learning or practising Carnatic music.

## 🎯 Objectives

- Develop a simple and economical web-based Carnatic notation editor.
- Provide a structured interface for entering swaras and sahitya.
- Support essential composition details such as raga, tala, and composer.
- Align swaras and lyrics using a grid-based notation interface.
- Organize notation into sections for better readability.
- Save and retrieve compositions using browser LocalStorage.
- Generate formatted notation sheets in PDF format.

## ✨ Features

- **Swaras and Sahitya Input:** Enter musical notes and their corresponding lyrics.
- **Grid-Based Editor:** Organize notes and lyrics in aligned cells.
- **Composition Details:** Include raga, tala, and composer information.
- **Notation Formatting:** Support octave variations, font size, font color, font thickness, and underlining.
- **Local Storage:** Save and retrieve compositions directly in the browser.
- **PDF Export:** Generate formatted Carnatic music notation sheets.
- **Easy-to-Use Interface:** Create and edit notation without specialized desktop software.

## 🛠️ Technologies Used

- **HTML5** – Structure of the application.
- **CSS3** – Styling and layout of the editor.
- **JavaScript** – Editing functionality and application logic.
- **LocalStorage** – Browser-based composition storage.
- **PDF Generation** – Exporting formatted notation sheets.

## 🚀 Getting Started

### Prerequisites

- A modern web browser such as Google Chrome, Microsoft Edge, or Mozilla Firefox.
- A code editor such as Visual Studio Code (optional).

## 📖 How to Use

1. Open the Carnatic Music Notation Editor in your browser.
2. Enter the composition details, including the raga, tala, and composer.
3. Add swaras and their corresponding sahitya in the notation grid.
4. Organize the notation into the required sections.
5. Apply formatting options such as octave variations, font styling, and underlining.
6. Save the composition for future access.
7. Export the formatted notation sheet as a PDF.

*Note: The availability of individual features depends on the current implementation of the project.*

## 🏗️ Project Structure

```text
carnatic-music-notation-editor/
│
├── index.html       # Main application page
├── style.css        # Styling and layout
├── script.js        # Application logic
├── README.md        # Project documentation
└── assets/          # Images and other resources (if applicable)
```

*Adjust the file structure above to match the actual files in your repository.*

## 💾 Data Storage

The application uses browser **LocalStorage** to save and retrieve compositions. This allows users to continue working on previously entered notation without requiring a server-side database.

Saved compositions are associated with the browser and device being used. Clearing browser data may remove locally stored compositions.

## 🎼 Scope and Limitations

- Focuses exclusively on Carnatic music notation.
- Does not include Hindustani music notation.
- Uses client-side technologies without requiring a server-side database.
- PDF output is intended to provide a clear, structured representation of Carnatic notation.

## 🔮 Future Enhancements

- Import and export compositions in structured digital formats.
- Add more advanced tala and sangati editing options.
- Improve notation layout and PDF customization.
- Support additional notation templates.
- Introduce cloud-based storage and sharing.
- Improve accessibility and mobile responsiveness.

## 📚 References

1. Stanly Mammen, Ilango Krishnamurthi, A. Jalaja Varma, and G. Sujatha, *iSargam: Music Notation Representation for Indian Carnatic Music*, EURASIP Journal on Audio, Speech and Music Processing, 2016.
2. Haathi Software – Haathi Carnatic Editor.
3. Gopalakrishna Palem – CarMusTy: Carnatic Music Typesetting.
4. Srikumar K. S. – Carnot: Carnatic Music Notation Rendering Engine.
5. Ragu Magu – Note-a-Bhairavi, open-source Carnatic music notation editor.
