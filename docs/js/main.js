function startApp(jQuery, window) {
  var $ = jQuery;
  var document = window.document;
  var apidocs = null;
  var currentHash = "";
  var shouldFadeAndScroll = true;
  var converter = new Showdown.converter();

  const DEFAULT_HASH = "guide/welcome";
  const IDLE_PING_DELAY = 500;
  const CHECK_HASH_DELAY = 100;
  const DOCUMENT_TITLE_ROOT = "Chromeless Documentation";

  function sortedKeys(obj) {
    var arr = [];
    for (var e in obj) if (obj.hasOwnProperty(e)) arr.push(e);
    arr.sort();
    return arr;
  }

  function checkHash() {
    var hash = window.location.hash;
    if (hash.length <= 1)
      hash = "#" + DEFAULT_HASH;
    if (hash != currentHash) {
      currentHash = hash;
      onHash(currentHash.slice(1));
    }
  }

  function onHash(hash) {
    var parts = hash.split("/");
    documentName = "";
    switch (parts[0]) {
    case "package":
      showPackageDetail(parts[1]);
      documentName = parts[1];
      break;
    case "module":
      var pkgName = parts[1];
      var moduleName = parts.slice(2).join("/");
      showModuleDetail(pkgName, moduleName);
      documentName = moduleName;
      break;
    case "guide":
      showGuideDetail(parts[1]);
      documentName = $('#' + parts[1]).text();
      break;
    case "apiref":
      showAPIRef(parts[1]);
      documentName = $('#' + parts[1]).text();
    }
    if (documentName.length > 0) {
      document.title = documentName + " - " + DOCUMENT_TITLE_ROOT;
    }
    else {
      document.title = DOCUMENT_TITLE_ROOT;
    }
  }

  function getModules(fileStruct) {
    var modules = [];
    for (var name in fileStruct) {
      if (name.match(/.*\.js$/))
        modules.push(name.slice(0, -3));
      else if (!('size' in fileStruct[name])) {
        var subModules = getModules(fileStruct[name]);
        subModules.forEach(
          function(subModule) {
            modules.push(name + "/" + subModule);
          });
      }
    }
    return modules;
  }

  function fixInternalLinkTargets(query) {
    query.find("a").each(
      function() {
        var href = $(this).attr("href");
        if (href && href.length && href[0] == "#")
          $(this).attr("target", "_self");
      });
  }

  function onPkgAPIError(req, where, source_filename) {
    var errorDisplay = $("#templates .module-parse-error").clone();
    errorDisplay.find(".filename").text(source_filename);
    errorDisplay.find(".technical-error").text(req.responseText);
    where.empty().append(errorDisplay);
    errorDisplay.hide();
    errorDisplay.fadeIn();
  }

  function showSidenotes(query) {
    var width = $("#sidenotes").innerWidth();
    var asides = query.find(".aside");
    var newAsides = $("<div></div>");
    $("#sidenotes").empty();
    asides.each(
      function() {
        var pos = $(this).position();
        $(this).remove();
        newAsides.append(this);
        $(this).css({top: pos.top});
      });
    $("#sidenotes").append(newAsides);
    newAsides.children().each(
      function() {
        $(this).width(width);
        var margin = $(this).outerWidth() - width;
        $(this).width(width - margin);
      });
  }

  var queuedContent = null;

  function queueMainContent(query, onDone) {
    queuedContent = query;
    function doIt() {
      $("#sidenotes").empty();
      $("#right-column").empty().append(query);
      onDone();
    }
    if (shouldFadeAndScroll) {
      scrollToTop(function () {
        $("#main-content").fadeOut(100, doIt);
      });
    }
    else {
      $("#main-content").hide();
      doIt();
    }
  }

  function scrollToTop(onDone) {
    var interval = window.setInterval(function () {
      if (window.scrollY == 0) {
        window.clearInterval(interval);
        onDone();
      }
      else
        window.scrollBy(0, -Math.max(window.scrollY / 10, 10));
    }, 10);
  }

  function showMainContent(query, url) {
    if (queuedContent != query)
      return;
    if (url)
      $("#view-source").attr("href", url);
    else
      // TODO: This actually just results in a 404.
      $("#view-source").attr("href", "");
    if (shouldFadeAndScroll)
      $("#main-content").fadeIn(400);
    else
      $("#main-content").show();
    shouldFadeAndScroll = false;
    fixInternalLinkTargets(query);
    showSidenotes(query);
    queuedContent = null;
  }

  // build an object which maps names to indexes for an array of
  // objects which contain a .name property 
  function buildNameToIxMap(arr) {
    var nameToIx = {};
    for (var i = 0; i < arr.length; i++) {
      nameToIx[arr[i].name] = i;
    }
    return nameToIx;
  }

  function populateFunctions(domElem, moduleName, functions) {
    var nameToIx = buildNameToIxMap(functions);
    var sortedMethods = sortedKeys(nameToIx);
    for (var f in sortedMethods) {
      var name = sortedMethods[f];
      f = functions[nameToIx[name]];
      var func = $("#templates .one-function").clone();
      func.find(".varname").text(moduleName);
      func.find(".funcName").text(name);
      if (!f.desc) {
        f.desc = "no documentation available for this function";
      }
      func.find(".description").html(converter.makeHtml(f.desc));

      // insert return value docs
      if (f.returns) {
        if (f.returns.type) {
          func.find(".invocation .type").text(f.returns.type);
        } else {
          func.find(".invocation .type").remove();
        }

        if (f.returns.desc) {
          func.find(".returndoc").html(converter.makeHtml(f.returns.desc));
        } else {
          func.find(".returnvalue").remove();
        }
      } else {
        func.find(".invocation .type").remove();
        func.find(".returnvalue").remove();
      }

      // insert params into invocation line and documentation
      if (f.params && f.params.length) {
        var ps = func.find(".params");
        var fpd = func.find(".paramdoc");
        for (var i = 0; i < f.params.length; i++) {
          var param = f.params[i];
          // add parameter to invocation line
          var p = $('<span><span class="type"></span><span class="name"></span></span>');
          if (param.type) p.find(".type").text(param.type);
          else p.find(".type").remove();
          if (param.name) p.find(".name").text(param.name);
          if (ps.children().size()) $("<span>, </span>").appendTo(ps);
          ps.append(p);

          // separate parameter documentation
          var p = $('<tr><td class="paramname"></td><td class="paramdesc"></td></tr>');
          p.find(".paramname").text(param.name);
          var desc = "";
          if (param.type) desc += "(" + param.type + ") ";
          if (param.desc) desc = converter.makeHtml(desc + param.desc);
          else desc += "no documentation available";
          p.find(".paramdesc").html(desc);
          fpd.append(p);
        }
      } else {
        // remove the parameters section entirely if they don't exist
        func.find(".parameters").remove();
      }

      func.appendTo(domElem);
    }
  }

  function populateProperties(domElem, moduleName, properties) {
    var nameToIx = buildNameToIxMap(properties);
    var sortedProps = sortedKeys(nameToIx);

    for (var p in sortedProps) {
      var name = sortedProps[p];
      p = properties[nameToIx[name]];
      var prop = $("#templates .one-property").clone();
      if (p.type) prop.find(".type").text(p.type);
      else prop.find(".type").remove();
      prop.find(".varname").text(moduleName);
      prop.find(".propName").text(name);
      if (!p.desc) {
        p.desc = "no documentation available for this property";
      }
      prop.find(".description").html(converter.makeHtml(p.desc));
      prop.appendTo(domElem);
    }
  }

  function populateClasses(domElem, moduleName, classes) {
    var nameToIx = buildNameToIxMap(classes);
    var sortedClasses = sortedKeys(nameToIx);

    for (var c in sortedClasses) {
      c = classes[nameToIx[sortedClasses[c]]];

      var t = $("#templates .class-detail").clone();
      t.find(".varname").text(moduleName);
      t.find(".name").text(c.name);

      if (c.desc) {
        t.find(".docs").html(converter.makeHtml(c.desc));
      } else {
        t.find(".docs").remove();
      }

      if (c.constructor) {
        // we'll treat constructors like a normal functions, but use the classname
        // as the function name
        var classCopy = $.extend(true, {}, c.constructor);
        classCopy.name = c.name;
        populateFunctions(t.find(".constructor"), moduleName, [ classCopy ]);
      } else {
        t.find(".constructor").remove();
      }

      if (c.properties) {
        populateProperties(t.find(".properties"), moduleName + "." + c.name, c.properties);
      } else {
        t.find(".properties").remove();
      }

      if (c.functions) {
        populateFunctions(t.find(".functions"), moduleName + "." + c.name, c.functions);
      } else {
        t.find(".functions").remove();
      }

      // XXX: for when we/if implement nested class support
      // if (c.classes) {
      //   ...
      // } else {
        t.find(".classes").remove();
      // }
      domElem.append(t);
    }
  }

  function populateModuleDocs(domElem, pkgName, module) {
    domElem.find(".package a")
      .text(pkgName)
      .attr('href', "#package/" + pkgName);

    domElem.find(".module").text(module.module);

    if (module.desc) {
      domElem.find(".docs").html(converter.makeHtml(module.desc));
    }

    if (module.functions) {
      var funcs = domElem.find(".functions");
      $("<h2>Functions</h2>").appendTo(funcs);
      populateFunctions(funcs, module.module, module.functions);
    }

    if (module.properties) {
      var props = domElem.find(".properties");
      $("<h2>Properties</h2>").appendTo(props);
      populateProperties(props, module.module, module.properties);
    }

    if (module.classes) {
      var classes = domElem.find(".classes");
      $("<h2>Classes</h2>").appendTo(classes);
      populateClasses(classes, module.module, module.classes);
    }
  }

  function showModuleDetail(pkgName, moduleName) {
    var module = apidocs[pkgName].modules[moduleName];
    var entry = $("#templates .module-detail").clone();

    populateModuleDocs(entry, pkgName, module);

    queueMainContent(entry, function () {
      showMainContent(entry);
    });
  }

  function listModules(pkg, entry) {
    var libs = [];
    if (pkg.modules) {
      libs = sortedKeys(pkg.modules);
    }
    var modules = entry.find(".modules");
    if (libs.length > 0) {
      modules.text("");
    }
    var count = 0;
    for (var x in libs) {
      moduleName = libs[x];
      var module = $('<li class="module"></li>');
      var hash = "#module/" + pkg.name + "/" + moduleName;
      $('<a target="_self"></a>')
        .attr("href", hash)
        .text(moduleName)
        .appendTo(module);
      modules.append(module);
      modules.append(document.createTextNode(' '));
      count++
    }
    return count;
  }

  function showPackageDetail(name) {
    var pkg = apidocs[name];
    var entry = $("#templates .package-detail").clone();
    
    entry.find(".name").text(name);

    // XXX: we need a nice way that package level documentation can
    // be included...  Previously there was a README.md file that
    // could be associated with packages.  That seems like a fine
    // thing to revive...  Alternately we could introduce a tag
    // for package docs?  options are abundant
    listModules(pkg, entry);

    queueMainContent(entry, function () {
      showMainContent(entry, null);
    });
  }

  function onPackageError(req) {
    if (req.status == 500) {
      var errorDisplay = $('<div class="technical-error"></div>');
      errorDisplay.text(req.responseText);
      $("#left-column").append(errorDisplay);
      errorDisplay.hide();
      errorDisplay.fadeIn();
    }
    finalizeSetup();
  }

  function processAPIDocs(apidocsJSON) {
    apidocs = apidocsJSON;
    finalizeSetup();
  }

  function finalizeSetup() {
    checkHash();
    if ("onhashchange" in window) {
      window.addEventListener("hashchange", checkHash, false);
    } else {
      window.setInterval(checkHash, CHECK_HASH_DELAY);
    }

    $('#hide-dev-guide-toc').click(function() {
      if ($(this).text() == 'hide') {
        $(this).text('show');
        $('#dev-guide-toc').hide('fast');
      } else {
        $(this).text('hide');
        $('#dev-guide-toc').show('fast');
      }
    });
  }

  function showGuideDetail(name) {
    var entry = $("#templates .guide-section").clone();
    var url = "md/dev-guide/" + name + ".md";

    entry.find(".name").text($("#dev-guide-toc #" + name).text());
    queueMainContent(entry, function () {
      var options = {
        url: url,
        dataType: "text",
        success: function(text) {
          entry.find(".docs").html(markdownToHtml(text));
          showMainContent(entry, url);
        },
        error: function(text) {
          showMainContent(entry);
        }
      };
      jQuery.ajax(options);
    });
  }

  function showAPIRef(name) {
      if (name === 'api-by-package') {
        var entry = $("#templates .package-list").clone();
        var sortedPackageNames = sortedKeys(apidocs);
        for (var p in sortedPackageNames) {
          p = sortedPackageNames[p];
          var item = $("#templates .one-package").clone();
          item.find(".name a")
            .text(apidocs[p].name)
            .attr('href', "#package/" + apidocs[p].name);
          item.find(".description").text(apidocs[p].desc);
          var count = listModules(apidocs[p], item);
          item.find(".number").text(count);
          item.appendTo(entry);
        }
        queueMainContent(entry, function () {
          showMainContent(entry);
        });
      } else if (name === 'api-full-listing') {
        var fullApi = $("#templates .full-api").clone();

        // for now we'll simply concatenate all modules docs onto
        // a single page
        var pkgs = sortedKeys(apidocs);

        for (var p in pkgs) {
          p = pkgs[p];
          var modules = sortedKeys(apidocs[p].modules);
          for (var m in modules) {
            m = modules[m];
            var modObj = apidocs[p].modules[m];
            var entry = $("#templates .module-detail").clone();
            populateModuleDocs(entry, p, modObj);
            fullApi.append(entry);
          }
        }

        // now a handler for text-change events on the filter box
        fullApi.find(".filter_container input").keyup(function(e) {
          var keys = $(this).val().trim().toLowerCase().split(" ");

          // a selector that describes all of the non-atoms.  that is, things to
          // hide when a filter is applied
          var nonAtoms = ".module-detail > .name," +
            ".module-detail > .example," +
            ".module-detail > .docs," +
            ".module-detail h2," +
            ".class-detail > .classname," +
            ".class-detail > .docs," +
            ".class-detail .littleheading";

          // if it's the empty string, show everything
          if (keys.length === 1 && "" === keys[0]) {
            $(nonAtoms).show();
            $(".one-function, .one-property").show();
            $(".class-detail").css("margin-left", "2em");

          } else {
            // search properties
            function hideIfNotMatch() {
              var match = true;
              for (var i = 0; i < keys.length; i++) {
                match = ($(this).text().toLowerCase().indexOf(keys[i]) >= 0);
                if (!match) break;
              }
              if (match) {
                $(this).show();
              } else {
                $(this).hide();
              }
            }
            // hide all non-atoms
            $(nonAtoms).each(function() { $(this).hide(); });

            // a little trick for nested classes, unindent them so they
            // appear reasonably in searches
            $(".class-detail").css("margin-left", "0em");

            // and check to see if the string sought occurs within
            // a documented property or function
            $(".one-function, .one-property").each(hideIfNotMatch);
          }
        });

        queueMainContent(fullApi, function () {
          showMainContent(fullApi);
        });
      }
  }

  function linkDeveloperGuide() {
    $(".link").each(
      function() {
        if ($(this).children().length == 0) {
          var hash = "#guide/" + $(this).attr("id");
          var hyperlink = $('<a target="_self"></a>');
          hyperlink.attr("href", hash).text($(this).text());
          $(this).text("");
          $(this).append(hyperlink);
        }
      });
  }

  function linkAPIReference() {
    $(".apiref").each(
      function() {
        if ($(this).children().length == 0) {
          var hash = "#apiref/" + $(this).attr("id");
          var hyperlink = $('<a target="_self"></a>');
          hyperlink.attr("href", hash).text($(this).text());
          $(this).text("");
          $(this).append(hyperlink);
        }
      });
  }

  linkDeveloperGuide();
  linkAPIReference();

  // pull in the json formated api doc database
  jQuery.ajax({url: "packages/apidocs.json",
               dataType: "json",
               success: processAPIDocs,
               error: onPackageError});

  $("a[href]").live("click", function () {
    var href = $(this).attr("href");
    if (href.length && href[0] == "#")
      shouldFadeAndScroll = true;
  });
}

$(window).ready(function() { startApp(jQuery, window); });
