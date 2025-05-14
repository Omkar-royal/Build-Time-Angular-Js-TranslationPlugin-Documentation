const path = require("path");
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const { minify } = require("html-minifier-terser");
const pLimit = require("p-limit");
require("dotenv").config();

let missingList = [];

class TranslationPlugin {
  constructor(options) {
    this.language = options.language || "te-IN";
    this.htmlDir = options.htmlDir || path.resolve(__dirname, "public/en-US");
    this.distDir = options.distDir || path.resolve(__dirname, "public/te-IN");

    this.translationMap = new Map();
    this.toTranslate = {};
    this.en = {};
    this.te = {};
    this.cachePath = path.resolve(__dirname, "translation-cache.json");
    this.cache = this.loadCache();
    this.limit = pLimit(10);
  }

  loadCache() {
    if (fs.existsSync(this.cachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.cachePath, "utf-8"));
        console.log("📦 Loaded translation cache");
        return data;
      } catch {
        return {};
      }
    }
    return {};
  }

  saveCache() {
    fs.writeFileSync(
      this.cachePath,
      JSON.stringify(this.cache, null, 2),
      "utf-8"
    );
    console.log("📦 Saved translation cache");
  }

  generateKey(text) {
    const normalized = text.trim().replace(/{{[^}]+}}/g, "[[INTP]]");
    return crypto.createHash("md5").update(normalized).digest("hex");
  }

  shouldSkip(text) {
    return (
      /^\s*{{.*}}\s*$/.test(text) || 
      /^\s*[:]?\s*{{.*?}}\s*[:]?\s*$/.test(text) ||
      /^\s*\(?{{.*}}\)?\s*$/.test(text) ||
      /^\s*[^\w\s]{0,2}?{{.*?}}[^\w\s]{0,2}?\s*$/.test(text) ||
      /^\s*$/.test(text) ||
      /^[^\w\s]{1,3}$/.test(text) ||
      (text.trim().length <= 2 && !/[a-zA-Z]/.test(text)) ||
      /^\s*<!--.*-->$/.test(text) ||
      /^\s*\/\/.*$/.test(text) ||
      /^\s*\/\*[\s\S]*?\*\/\s*$/.test(text) ||
      /^\s*{{--.*--}}\s*$/.test(text) 
    );
  }

  handleInterpolation(text) {
    const interpolationPattern = /{{[^}]+}}/g;
    let counter = 0;
    const placeholders = {}; // Ensure this is initialized correctly

    const processedText = text.replace(interpolationPattern, (match) => {
      const placeholder = `[[INTP${counter++}]]`;
      placeholders[placeholder] = match; // This correctly stores the original match
      return placeholder;
    });

    // console.log("Processed Text:", processedText); // Log processed text
    // console.log("Placeholders:", placeholders); // Log placeholders to verify

    return { processedText, placeholders }; // Return both processed text and placeholders
  }

  restoreInterpolations(text, placeholders) {
    let result = text;
    for (const [ph, original] of Object.entries(placeholders)) {
      result = result.replace(ph, original);
    }
    return result;
  }
  translateText(text, key, filePath, placeholders) {
    if (this.translationMap.has(key)) return;

    if (this.cache[key]) {
      this.en[key] = this.cache[key].en_text;
      this.te[key] = this.cache[key].te_text;
      this.translationMap.set(key, true);
      return;
    }

    this.toTranslate[key] = {
      text,
      interpolations: placeholders,
      filePath,
    };
  }

  async performBatchTranslation() {
    const entries = Object.entries(this.toTranslate);
    const baseUrl = process.env.APP_URL;

    if (entries.length === 0) return;
    const chunkSize = 500;
    const chunks = [];

    for (let i = 0; i < entries.length; i += chunkSize) {
      chunks.push(entries.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      try {
        const res = await axios.post(
          `${baseUrl}translations/batch-translation-text`,
          {
            translations: chunk.map(
              ([key, { text,  interpolations }]) => ({
                key,
                en_text: text,
                interpolations,
              })
            ),
          }
        );

        for (const item of res.data) {
          const { key, en_text, te_text, interpolations } = item;
          // console.log("Interpolations:", interpolations);

          this.en[key] = en_text;
          this.te[key] = te_text;

          this.translationMap.set(key, true);
          this.cache[key] = { en_text, te_text, interpolations };
        }

        console.log(`🌐 Batch translated ${chunk.length} items`);
      } catch (err) {
        // console.error("❌ Batch translation error:", err);

        console.error("❌ Batch translation error:", err.message);
      }
    }
  }

  async replacePlaceholders() {
    const dir = path.join(this.distDir);

    const replaceInFile = async (file, relativePath) => {
      let content = fs.readFileSync(file, "utf-8");

      // Replace all translation keys
      content = content.replace(/__TRANS__([a-f0-9]{32})__/g, (match, key) => {
        const fullObj = this.cache[key]; // Use the full object with interpolations
        if (!fullObj) return match;

        // Choose translation based on language
        let translated =
          this.language === "te-IN" && fullObj.te_text
            ? fullObj.te_text
            : fullObj.en_text;

        // Replace placeholders (interpolations) if present
        if (fullObj.interpolations) {
          for (const [placeholder, original] of Object.entries(
            fullObj.interpolations
          )) {
            translated = translated.replace(placeholder, original);
          }
        }

        return translated;
      });

      // Minify the result
      const outPath = path.join(this.distDir, relativePath);

      let finalContent = content;
      try {
        finalContent = await minify(content, {
          collapseWhitespace: true,
          removeComments: true,
          keepClosingSlash: true,
          minifyCSS: false,
          minifyJS: false,
          minifyURLs: false,
        });
      } catch (err) {
    // console.log(`❌ HTML error to: ${outPath}`);

        return;
      }
      fs.writeFileSync(file, finalContent, "utf-8");
    // console.log(`✅ HTML written to: ${outPath}`);

    };

    // Recursively walk all HTML files
    const walkAndReplace = async (dirPath) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.distDir, fullPath);

        if (entry.isDirectory()) {
          await walkAndReplace(fullPath);
        } else if (entry.isFile() && fullPath.endsWith(".html")) {
          await replaceInFile(fullPath, relativePath);
        }
      }
    };

    await walkAndReplace(dir);
  }

  async processHtml(filePath) {
    const fileName = path.basename(filePath);
    let original = fs.readFileSync(filePath, "utf-8");
    try {
      original = await minify(original, {
        collapseWhitespace: true,
        removeComments: true,
        keepClosingSlash: true,
        minifyCSS: false,
        minifyJS: false,
        minifyURLs: false,
      });
    } catch (err) {
      // console.error(`❌ Minify failed for ${filePath}: ${err.message}`);
      missingList.push(filePath);
      return; // skip this file
    }

    const $ = cheerio.load(original, { decodeEntities: false });

    await this.walk($.root(), $);

    const relativePath = path.relative(this.htmlDir, filePath);
    const outPath = path.join(this.distDir, relativePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    let outputHtml;

    if (
      original.includes("<html") ||
      original.includes("<!DOCTYPE") ||
      original.includes("<!doctype")
    ) {
      outputHtml = $.html();
    } else {
      if ($("html").length > 0) {
        const headContent = $("head").html() || "";
        const bodyContent = $("body").html() || "";
        outputHtml = (headContent + bodyContent).trim();
      } else {
        outputHtml = $.root().contents().toString().trim();
      }
    }

    fs.writeFileSync(outPath, outputHtml, "utf-8");
    // console.log(`✅ HTML written to: ${outPath}`);
  }

  
  async walk(node, $, relativeFilePath) {
    const promises = [];
    $(node)
      .contents()
      .each((i, child) => {
        if (!child || !child.type) return;
        const childNode = $(child);
        const parentTag = childNode.parent().prop("tagName");
        if (["STYLE", "SCRIPT"].includes(parentTag)) return;

        if (child.type === "text") {
          const originalText = childNode.text();
          if (this.shouldSkip(originalText)) return;

          // Interpolate text and get placeholders
          const { processedText, placeholders } =
            this.handleInterpolation(originalText);

          // Split processed text into parts for translation
          const parts = processedText.split(/(&nbsp;|<br\s*\/?>)/g);

          // Map over the parts and translate each part
          const translatedParts = parts.map((part) => {
            if (part === "&nbsp;" || part.match(/<br\s*\/?>/)) return part;

            // Call translateText and pass placeholders directly
            const key = this.generateKey(
              part + JSON.stringify(Object.entries(placeholders).sort())
            );

            this.translateText(part, key, relativeFilePath, placeholders);

            return `__TRANS__${key}__`;
          });

          promises.push(
            Promise.resolve().then(() => {
              const joined = translatedParts.join("");
              const restored = this.restoreInterpolations(joined, placeholders);
              childNode.replaceWith(restored);
            })
          );
        } else if (child.type === "tag") {
          promises.push(this.walk(child, $, relativeFilePath));
        }
      });
    return Promise.all(promises);
  }

  async walkDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath);
      } else if (entry.isFile() && fullPath.endsWith(".html")) {
        await this.processHtml(fullPath);
      }
    }
  }

  saveMissingListToFile() {
    const outputPath = path.join(__dirname, "missing_translation_files.json");
    fs.writeFileSync(outputPath, JSON.stringify(missingList, null, 2));
    console.log(`📄 Missing file list written to: ${outputPath}`);
  }

  apply(compiler) {
    if (!compiler.options.output.path.includes(this.language)) {
      console.log(
        `🛑 Skipping TranslationPlugin for non-${this.language} build`
      );
      return;
    }

    compiler.hooks.beforeRun.tapPromise("TranslationPlugin", async () => {
      console.log(`🌐 Running TranslationPlugin for ${this.language}...`);
      await this.walkDirectory(this.htmlDir);
      await this.performBatchTranslation();
      await this.replacePlaceholders();

      const localeDir = path.join(this.distDir, "locales");
      fs.mkdirSync(localeDir, { recursive: true });
      fs.writeFileSync(
        path.join(localeDir, `${this.language}.json`),
        JSON.stringify(this.language === "te-IN" ? this.te : this.en, null, 2),
        "utf-8"
      );

       this.saveCache();
      this.saveMissingListToFile();
      console.log("✅ Translation JSON written.");
    });
  }
}

module.exports = TranslationPlugin;
