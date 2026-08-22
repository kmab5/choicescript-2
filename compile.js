knownScenes = [];
// scenes discovered by crawling *gosub_scene / *goto_scene references rather
// than declared in *scene_list; a missing one warns instead of failing
var crawledScenes = [];
var scene_object = "";
var success = true;
var skip = false;
var loadFailed = false;

var rootDir;

if (typeof process != "undefined") {
  var outputFile = process.argv[2] || "output.html";
  rootDir = process.argv[3];
  if (rootDir) {
    rootDir += "/";
  } else {
    rootDir = "web/";
  }
  fs = require('fs');
  path = require('path');
  vm = require('vm');
  load = function(file) {
    vm.runInThisContext(fs.readFileSync(file), file);
  };
  // mygamegenerator.js runs via runInThisContext, i.e. in the global context,
  // where compile.js's module-scoped `var rootDir` is invisible. Publish it.
  global.rootDir = rootDir;
  load(rootDir+ "scene.js");
  load(rootDir+"navigator.js");
  load(rootDir+"util.js");
  load("headless.js");
  load(rootDir+"mygame/mygame.js");
  load("mygamegenerator.js");
  var {content} = compile();
  fs.writeFileSync(outputFile, content, "utf8");
  console.log('Generated', path.resolve(outputFile));
}

if (!rootDir) rootDir = "web/";

function compile(){
  if (typeof window !== 'undefined' && "file:" === window.location.protocol && !window.slurpedFiles) {
    window.loading.innerHTML = "<p>Please \"upload\" the choicescript folder (including compile.html).</p>";
    var input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    loading.appendChild(input);
    input.addEventListener('change', function() {
      var candidates = [];
      var numFiles = input.files.length;
      for (var i = 0; i < numFiles; i++) {
        var file = input.files[i];
        if (input.files[i].name == "scene.js") {
          candidates.push(file);
        }
      }
      if (!candidates.length) {
        alert("We couldn't find scene.js in the folder you chose. Please try again. (Note that compile.html requires access to the entire choicescript directory, not just the mygame folder");
      } else if (candidates.length > 1) {
        if (candidates.length > 1) {
          alert("There were multiple files called scene.js in the folder you chose. Please try again.\n" +
            candidates.map(function(file) {return "\u2022 " + file.webkitRelativePath}).join("\n"));
        }
      }
      rootDir = candidates[0].webkitRelativePath.replace(/\/scene.js$/, "/");
      var rootDirTest = new RegExp("^" + rootDir + ".*\.(js|css|html|txt)");
      loading.innerHTML = "";
      var webFiles = [].filter.call(input.files, function(file) {
        return rootDirTest.test(file.webkitRelativePath);
      });
      Promise.all(webFiles.map(function(file) {return new Response(file).text()})).then(function(results) {
        window.slurpedFiles = {};
        for (var i = 0; i < webFiles.length; i++) {
          slurpedFiles[webFiles[i].webkitRelativePath] = results[i];
        }
        slurpFile = function(url, throwOnError) {
          var parts = url.split('/');
          var newParts = [];
          for (var i = 0; i < parts.length; i++) {
            if (".." === parts[i]) {
              newParts.pop();
            } else {
              newParts.push(parts[i]);
            }
          }
          url = newParts.join('/');
          if (throwOnError && ! slurpedFiles[url]) {
            throw new Error("Error: Could not open " + url);
          }
          return slurpedFiles[url];
        }
        var compiledResult = compile();
        if (compiledResult) finish(compiledResult);
      })
    });
    return;
  }

  function safeSlurpFile(file) {
    try {
      return slurpFile(file, false);
    } catch (e) {
      return null;
    }
  }

  //1. Grab the game's html file
  var url = rootDir+"mygame/index.html";
  var game_html = slurpFile(url, true);

  // A published game ships its own mygame/index.html that loads the OLD runtime
  // (../ui.js, ../style.css, ../alertify.min.js). Those files no longer exist,
  // so building against that shell silently produces a large, completely inert
  // page: none of the current UI is referenced, so none of it gets inlined.
  // Detect that and build against the canonical shell instead.
  if (/\.\.\/(ui|alertify(\.min)?)\.js|\.\.\/style\.css/.test(game_html)) {
    console.log("");
    console.log("NOTE: mygame/index.html is from an older ChoiceScript release.");
    console.log("      Building against web/shell/index.html instead.");
    console.log("      Run 'node tools/import-game.js <game>' to fix it permanently.");
    game_html = slurpFile(rootDir+"shell/index.html", true);
  }
    
  //2. Find and extract all .js file data
  var next_file = "";
  var patt = /<script.*?src=["'](.*?)["'][^>]*><\/script>/gim;
  var doesMatch;
  var jsStore = "";
  var missingScripts = [];
  console.log("\nExtracting js data from:");
  while (doesMatch = patt.exec(game_html)) {
    console.log(doesMatch[1]);
    if (doesMatch[1] === 'mygame.js') {
      next_file = generateMygame();
    } else {
      next_file = safeSlurpFile(rootDir + 'mygame/' + doesMatch[1]);
    }
    if (next_file != "undefined" && next_file !== null) {
      jsStore = jsStore + "\n;\n" + next_file;
    } else {
      // Silently skipping a script produces a build that looks fine and is
      // dead on arrival. Say so.
      console.log("  ! MISSING: " + doesMatch[1] + " (not inlined)");
      missingScripts.push(doesMatch[1]);
    }
  }
  
  if (missingScripts.length) {
    throw new Error("Cannot build: " + missingScripts.length +
      " script file(s) referenced by mygame/index.html do not exist (" +
      missingScripts.join(", ") + "). The resulting page would not run. " +
      "Run 'node tools/import-game.js <game>' to import a published game correctly.");
  }

  console.log("");

  //3. Find and extract all .css file data
  patt = /^<link[\s][\w'"\=\s\.\/]*[\s]?href\=["']([\w\.\/]*.css)["']/gim;
  var cssStore = "";
  console.log("\nExtracting css data from:");
  while (doesMatch = patt.exec(game_html)) {
    // console.log(doesMatch[0]);
    console.log(doesMatch[1]);
    try {
      next_file = slurpFile(rootDir+'mygame/' + doesMatch[1], true);
      if (next_file != "undefined" && next_file !== null) {
        cssStore = cssStore + next_file;
      }
    } catch (e) {
      // A game's index.html may reference a stylesheet that no longer exists
      // (older published games shipped their own copy of the runtime). Warn and
      // keep going rather than aborting the whole build.
      console.log("  ! skipping missing stylesheet: " + doesMatch[1]);
    }
  }

  //3.5 Preserve the favicon. Step 4 strips every <link>, which would drop it,
  //    and a relative href would not resolve beside a single exported file
  //    anyway. Inline it as a data URI.
  var faviconTag = "";
  var iconMatch = /<link[^>]*rel=["']icon["'][^>]*>/i.exec(game_html);
  if (iconMatch) {
    var hrefMatch = /href=["']([^"']+)["']/i.exec(iconMatch[0]);
    if (hrefMatch) {
      var iconPath = hrefMatch[1];
      var resolved = /^\.\.\//.test(iconPath)
        ? rootDir + iconPath.replace(/^\.\.\//, "")
        : rootDir + "mygame/" + iconPath;
      var inlined = slurpImage(resolved);
      if (/^data:/.test(inlined)) {
        faviconTag = '<link rel="icon" href="' + inlined + '">';
        console.log("");
        console.log("Favicon inlined from: " + resolved);
      } else {
        console.log("  ! favicon not found: " + resolved);
      }
    }
  }

  //4. Remove css links
  patt = /^<link[\s][\w'"\=\s\.\/]*>/gim;
  game_html=game_html.replace(patt,"");

  //5. Remove js links
  patt = /^<script src\=[^>]*><\/script>/gim;
  game_html=game_html.replace(patt,"");

  //6. Slice the document and check for a *title
  var top = game_html.slice(0, (game_html.indexOf("</head>") - 1));
  var bottom = game_html.slice((game_html.indexOf("</head>")),game_html.length);

  //7.1 Find scene files (as we can't read the dir)
  console.log("");
  console.log("Searching for scene files...");
  for (var i = 0; i < nav._sceneList.length; i++) {
    addFile(nav._sceneList[i] + ".txt");
  }

  // Scenes reached only by *gosub_scene / *goto_scene never appear in
  // *scene_list, so a build driven by that list alone omits them and the game
  // dies at runtime with "Couldn't load scene". When we can read the directory
  // (the Node path), bundle every scene file present.
  if (typeof fs !== "undefined" && fs && fs.readdirSync) {
    try {
      var sceneDir = rootDir + "mygame/scenes";
      var found = fs.readdirSync(sceneDir);
      for (var f = 0; f < found.length; f++) {
        if (/\.txt$/.test(found[f])) addFile(found[f]);
      }
    } catch (e) {
      console.log("  ! could not scan scenes directory: " + e.message);
    }
  }

  verifyFileName("choicescript_stats.txt");
  verifyFileName("choicescript_upgrade.txt");
  
  //Check startup.txt for a *scene_list
  var sceneList = false;
  scene = new Scene("startup");
  var scene_data = slurpFile(rootDir+'mygame/scenes/startup.txt', true);
  scene.loadLines(scene_data);
  patt = /^\*scene_list\b/i;
  for (i = 0; i < scene["lines"].length; i++) {
    if (patt.exec(scene["lines"][i])) {
      sceneList = true;
      scene.lineNum = i;
      break;
    }
  }
  //if we have a scene_list, add its contents to knownScenes
  if (sceneList) {
    var scenes = scene.parseSceneList();
    for (i = 0; i < scenes.length; i++) {
      verifyFileName(scenes[i]+".txt");
    }
  }
  
  for (i in knownScenes) {
    console.log(knownScenes[i]);
  }
    
    //whilst we're looking at startup.txt, check for a *title
    var csTitle = "";
    patt = /^\*title/i;
    for (i = 0; i < scene["lines"].length; i++) {
      if (patt.exec(scene["lines"][i])) {
        csTitle = scene["lines"][i];
      }
    }

    var csAuthor = "";
    patt = /^\*author/i;
    for (i = 0; i < scene["lines"].length; i++) {
      if (patt.exec(scene["lines"][i])) {
        csAuthor = scene["lines"][i];
      }
    }

    //if we have a title, set the <h1> and <title> tags to it
    if (csTitle != "") {
      patt = /^\*title[\s]+/i
      csTitle = csTitle.replace(patt, "");
      patt = /<title>.*<\/title>/i;
      if (patt.exec(top)) top = top.replace(patt, "<title>" + csTitle + "</title>");
      // Keep whatever attributes the shell put on the tag. Replacing them with
      // class='gameTitle' strips cs-title, whose flex rule is what spaces the
      // header, so the title and buttons collapse together.
      patt = /<h1([^>]*)>[\s\S]*?<\/h1>/i;
      if (patt.exec(bottom)) {
        bottom = bottom.replace(patt, function (m, attrs) {
          if (!/id\s*=/.test(attrs)) attrs += ' id="title"';
          return "<h1" + attrs + ">" + csTitle + "</h1>";
        });
      }
      console.log("");
      console.log("Game title set to: " + csTitle);
    }
    if (csAuthor != "") {
      patt = /^\*author[\s]+/i
      csAuthor = csAuthor.replace(patt, "");
      // The shell uses <p id="author">, not <h2>, so match either and keep attrs.
      patt = /<(h2|p)([^>]*\bid\s*=\s*["']author["'][^>]*)>[\s\S]*?<\/\1>/i;
      if (patt.exec(bottom)) {
        bottom = bottom.replace(patt, function (m, tag, attrs) {
          return "<" + tag + attrs + ">by " + csAuthor + "</" + tag + ">";
        });
      } else {
        patt = /<h2([^>]*)>[\s\S]*?<\/h2>/i;
        if (patt.exec(bottom)) {
          bottom = bottom.replace(patt, function (m, attrs) {
            if (!/id\s*=/.test(attrs)) attrs += ' id="author"';
            return "<h2" + attrs + ">by " + csAuthor + "</h2>";
          });
        }
      }
      console.log("");
      console.log("Author set to: " + csAuthor);
    }
  
  var ifidLine = scene.lines.find(line => /^\*ifid/i.test(line));
  if (ifidLine) {
    var ifid = ifidLine.replace(/^\*ifid\s+/i, "").toUpperCase();
    top = top.replace('window.storeName = null;', `window.storeName = "CS-${ifid}";`)
    top += `<meta property="ifiction:ifid" content="${ifid}" prefix="ifiction: http://babel.ifarchive.org/protocol/iFiction/">`;
  } else {
    // Without a storeName, initStore() bails and window.store is never created:
    // saving throws, and preferences and achievements never persist. Derive a
    // stable name from the title so the build is at least usable.
    var slug = (csTitle || "mygame").replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "").toLowerCase();
    top = top.replace('window.storeName = null;',
      'window.storeName = "CS-' + (slug || "mygame") + '";');
    console.log("");
    console.log("No *ifid: using derived save name \"CS-" + slug + "\".");
    console.log("WARNING: No *ifid. Add one to startup.txt for a stable save identity.");
    try {
      var example = crypto.randomUUID();
      console.log("  You can use this randomized IFID: *ifid " + example);
    } catch (e) {}
  }

  //7.2 Create the allScenes object
  console.log("");
  console.log("Combining scene files...");
  var scene_data = "";
  for (var i = 0; i < knownScenes.length; i++) {
      scene_data = safeSlurpFile(rootDir+'mygame/scenes/' + knownScenes[i]);
      if (scene_data === null || typeof scene_data === 'undefined') {
        if ("choicescript_upgrade.txt" === knownScenes[i]) continue;
        if (crawledScenes.indexOf(knownScenes[i]) !== -1) {
          // Referenced by a *gosub_scene we found while crawling, but not
          // present. Could be a conditional branch the author never shipped,
          // or a reference inside a comment. Warn and carry on.
          console.log("  ! referenced but missing, skipping: " + knownScenes[i]);
          knownScenes.splice(i, 1);
          i--;
          continue;
        }
        throw new Error("Couldn't find file " + 'mygame/scenes/' + knownScenes[i]);
      }
      var scene = new Scene();
      scene.loadLines(scene_data);

      // Crawl cross-scene references. A scene reached only by *gosub_scene,
      // *goto_scene or *redirect_scene never appears in *scene_list, so a build
      // driven by that list alone omits it and the game dies at runtime with
      // "Couldn't load scene". Directory scanning only works under Node;
      // compile.html runs in a browser and cannot read directories. Reading the
      // references out of the scene text works in both, and pulls in
      // dependencies transitively because this loop grows as we append.
      for (var ln = 0; ln < scene.lines.length; ln++) {
        var ref = /^\s*\*(?:gosub_scene|goto_scene|redirect_scene)\s+(\S+)/i
          .exec(scene.lines[ln]);
        if (!ref) continue;
        var refName = ref[1].replace(/["']/g, "");
        // skip variable references like *goto_scene {var}
        if (/[{}$]/.test(refName)) continue;
        if (crawledScenes.indexOf(refName + ".txt") === -1 &&
            knownScenes.indexOf(refName + ".txt") === -1) {
          crawledScenes.push(refName + ".txt");
        }
        addFile(refName + ".txt");
      }

      var sceneName = knownScenes[i].replace(/\.txt/gi,"");
      sceneName = sceneName.replace(/ /g, "_");
      if (typeof slurpImage !== "undefined") {
        scene.lines = scene.lines.map(line => {
          let result = /^(\s*\*)(\w+)(.*)/.exec(line);
          if (!result) return line;
          let command = result[2].toLowerCase();
          // NOTE: the original guard was /(text_)image/, where the group is
          // REQUIRED, so plain *image never matched and its file was never
          // inlined. Make the prefix optional.
          if (!/^(text_)?image$/.test(command)) return line;
          let data = trim(result[3]);
          let match = /(\S+) (\S+)(.*)/.exec(data);
          if (match) {
            let image = slurpImage(rootDir + 'mygame/' + match[1]);
            return `${result[1]}${command} ${image} ${match[2]}${match[3]}`;
          } else {
            let image = slurpImage(rootDir + 'mygame/' + data);
            return `${result[1]}${command} ${image}`;
          }
        });
      }
      scene_object = scene_object + "\"" + sceneName + "\": {\"crc\":" + scene.crc + ", \"lines\":" + toJson(scene.lines)+ ", \"labels\":" + toJson(scene.labels) + "}";
      if ((i + 1) != knownScenes.length) {
        scene_object += ",\n";
      }
  }
  scene_object = "allScenes = {" + scene_object + "}";

  //8. Reassemble the document (selfnote: allScenes object seems to cause issues if not in its own pair of script tags)
  console.log("Assembling new html file...");
  var new_game = top + faviconTag + "<script>" + scene_object + "<\/script><script>" + jsStore + "<\/script><style>" + cssStore + "</style>" + bottom;
  return {content: new_game, title: csTitle};
}

// Inline an image as a data URI. compile.js referenced slurpImage but never
// defined it, so *image / *text_image kept relative paths that do not resolve
// next to a single exported HTML file: the splash image simply never appeared.
function slurpImage(file) {
  if (typeof fs === "undefined" || !fs || !fs.readFileSync) return file;
  // NOTE: compile() is invoked near the top of this file, before module-level
  // var assignments further down have run. A hoisted `var` map would still be
  // undefined here, so the table lives inside the function.
  var IMAGE_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".avif": "image/avif", ".bmp": "image/bmp"
  };
  try {
    var ext = (file.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
    var mime = IMAGE_MIME[ext];
    if (!mime) return file;
    var data = fs.readFileSync(file);
    return "data:" + mime + ";base64," + data.toString("base64");
  } catch (e) {
    console.log("  ! image not found, leaving path as-is: " + file);
    return file;
  }
}

function addFile(name) {
  for (var i = 0; i < knownScenes.length; i++) {
    if (knownScenes[i] == name) return;
  }
  knownScenes.push(name);
}

function verifyFileName(name) {
  addFile(name);
}
