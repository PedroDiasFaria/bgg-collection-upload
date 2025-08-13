# BGG Collection Upload

A script to bulk upload your board game collection to BoardGameGeek (BGG).

You need a collection `.csv` file downloaded directly from any BGG profile.

---

## Credits

This script is inspired by `fenglish`'s [bulk-upload-board-games-into-bgg-collection](https://github.com/fenglisch/bulk-upload-board-games-into-bgg-collection). I extended it to make full collection backups easier.

---

## Setup

**Prerequisites:**

- Node.js (v22.16.0 or higher)
- Yarn ([installation guide](https://yarnpkg.com/getting-started/install))
- Google Chrome or Firefox (Chrome is the default browser)

> If you want to use Firefox, you must explicitly specify it when running the program (see "Additional Options").

### Installation

1. Clone or download this repository to a local directory.
2. Open a terminal and navigate to the root directory.
3. Install dependencies:

```
$ yarn
```

### Running the Script

The basic syntax is:

```
$ yarn start PATH/TO/my-collection.csv -u your_username -p your_password
```

Example:

```
$ yarn start collection_test.csv -u UserName -p 123456789
```

### Additional Options

- `firefox` – Run the script in Firefox instead of the default Chrome.
- `show-browser` - Run the browser in non-headless mode, so you can watch it navigate and click buttons. Useful for debugging.

Example with all options:

```
$ yarn start collection_test.csv -u UserName -p 123456789 firefox show-browser
```

(The order of the additional options does not matter.)

## How It Works

1. Reads each row from your input CSV file and extracts key properties for each game.
2. Compares them with your existing BGG collection via the XML API2.
3. Determines which games are new or updated (including wishlist, priority, versions, comments, etc.).
4. Starts a browser session with Selenium WebDriver (Chrome or Firefox).
5. Logs in and navigates to each game page by ID/version.
6. Adds the games to your collection by simulating button clicks.
7. Continues until all items are processed or an error occurs.

## Performance

- On typical hardware:
  - ~3–4 seconds per game in Chrome
  - ~4–5 seconds per game in Firefox
- Adding specific language versions may increase time to 6–7 seconds per game.
- Closing other programs may improve performance.
