# 📖 Build-Time Translation Plugin for AngularJS
This plugin is part of a build-time translation workflow for AngularJS (1.x) applications. It extracts static text from HTML templates, translates it using a Laravel backend, and writes fully translated versions to language-specific directories (e.g., public/te-IN).

# 📦 Purpose
🧲 Extract static strings from AngularJS templates (.html files)


🚫 Ignore dynamic AngularJS expressions ({{expression}})


🌐 Translate text using Laravel API


🔁 Reinject translated text with original {{interpolation}} placeholders


💾 Save output HTML files in a new directory (public/te-IN)


📄 Generate a JSON translation map for the translated language






# 🧩 Plugin Name
🔧 TranslationPlugin (custom Webpack plugin)

# 📁 Project Directory Structure

project-root/ <br>
├── public/ <br>
│   ├── en-US/             # 🌍 Source HTML files <br>
│   ├── te-IN/             # 🌐 Output translated files  <br>
│   │   └── locales/  <br>
│   │       └── te-IN.json # 📘 Translation map  <br>
├── webpack.config.js      # ⚙️ Webpack config  <br>
├── TranslationPlugin.js   # 🧩 Custom Webpack plugin  <br>
├── .env                   # 🔐 Contains APP_URL  <br>


# ⚙️ Webpack Setup
webpack.config.js <br>

<p style="border:2px solid green; width:100px;">
  <pre><code>
    const TranslationPlugin = require('./TranslationPlugin');
const path = require('path');
module.exports = { 
  // your existing config ...
  plugins: [ 
    new TranslationPlugin({
      language: 'te-IN',
      htmlDir: path.resolve(__dirname, 'public/en-US'),
      distDir: path.resolve(__dirname, 'public/te-IN'),
    }),
  ],
};
</code></pre>

</p>





# 🔐 Environment Variables
Requires an environment variable in .env file:
APP_URL=http://your-domain.com/


# 🧠 Key Methods Overview
💾 loadCache() / saveCache()  <br>
 &nbsp; &nbsp; Reads and writes the cache of previously translated text from translation-cache.json.  <br>
🔑 generateKey(text)  <br>
 &nbsp; &nbsp; Generates a unique MD5 hash for a given text with normalized interpolations. <br>
🚫 shouldSkip(text) <br>
 &nbsp; &nbsp; Returns true for text that should not be translated (comments, blank strings, special patterns). <br>

🔍 handleInterpolation(text) and 🔙 restoreInterpolations() <br>
 &nbsp; &nbsp; Extracts and later restores placeholders like {{username}} from the text. <br>
🌐 translateText(text, key, filePath, placeholders) <br>
 &nbsp; &nbsp; Prepares the text for batch translation, checking cache first. <br>
📤 performBatchTranslation() <br>
  &nbsp; &nbsp;  Sends all collected texts to the API endpoint /translations/batch-translation-text for translation. <br>
🔁 replacePlaceholders() <br>
   &nbsp; &nbsp; Walks the output HTML directory, replacing __TRANS__<key>__ placeholders with translated text and restores interpolations. <br>
🧩 processHtml(filePath) <br>
 &nbsp; &nbsp;   Parses a single HTML file, identifies text nodes, replaces with translation keys. <br>
🌳 walk(node, $, relativeFilePath) <br>
  &nbsp; &nbsp;  Recursively walks a DOM tree to process all text nodes. <br>
📂 walkDirectory(dirPath) <br>
  &nbsp; &nbsp;  Recursively walks the entire source directory, processing all .html files. <br>
❗ saveMissingListToFile() <br>
   &nbsp; &nbsp; Writes a list of files that failed translation to missing_translation_files.json. <br>
🔁 apply(compiler) <br>
 &nbsp; &nbsp; The main Webpack hook that runs translation only for the configured language build. <br>

# 📄 Output Files
## 1. 📝 Translated HTML Files
📁 public/te-IN/


🧱 Same structure as original


✅ Interpolations preserved


🌐 Static strings translated


## 2. 📘 JSON Translations
📁 public/te-IN/locales/te-IN.json
{
  "c4ca4238a0b923820dcc509a6f75849b": "హలో, {{username}}!"
} 
## 3. ⚠️ Error Log
🧾 missing_translation_files.json
Lists files that failed during parsing/processing
🌐 Laravel API for Translation
📬 Endpoint: POST /translations/batch-translation-text
## 🔢 Request Payload:
 <pre><code>
{
  "translations": [
    {
      "key": "md5hash_of_en_text",
      "en_text": "Hello, {{username}}!",
      "interpolations": {
        "[[INTP0]]": "{{username}}"
      }
    }
  ]
}
 </code></pre>
## 📤 Response Format:
 <pre><code>
[
  {
    "key": "md5hash_of_en_text",
    "en_text": "Hello, {{username}}!",
    "te_text": "హలో, {{username}}!",
    "interpolations": {
      "[[INTP0]]": "{{username}}"
    }
  }
]
 </code></pre>

# 📜 How AngularJS Templates Are Handled
Feature
Support
Static HTML text
✅
AngularJS bindings ({{...}})
✅
Interpolation placeholders
✅
ng-if, ng-repeat, etc.
✅ (HTML only)
Dynamic translations (runtime)
❌


# 🧠 Notes
📁 One build folder per language: en-US, hi-IN, te-IN, etc.


🔄 AngularJS code remains unchanged


📦 Designed for production builds


✂️ Uses html-minifier-terser to clean up HTML


💡 Supports  & nbsp;, break, etc.


❗ Only translates .html files – JS & CSS are ignored


🧵 Concurrency handled via p-limit

# ✅ Benefits
⚡ Fast builds – Translations done at compile time


🌐 SEO-friendly – Text is fully rendered in HTML


🧱 No refactor – Works with legacy AngularJS 1.x


🎯 Accurate – Laravel backend ensures consistent translations
# 🛠️ Optional Enhancements
Add support for JS translations


Automatic fallback to untranslated text


Real-time translation status tracking


CLI version of this plugin
