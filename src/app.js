var files = {};
//map of ids to files for faster lookup
var lookupTable = {}

//local storage
const indexKey = "org.forager.fileIndex"
const filePrefix = "org.forager.file."

const loadFromStorage = () => {
    console.log("load from storage")
    fileIndex = JSON.parse(localStorage.getItem(indexKey))
    console.log("index", fileIndex)
    if (fileIndex === null) {
        return
    }

    var readFiles = {};
    for (index of fileIndex) {
        console.log("loading", index)
        readFiles[index] = JSON.parse(localStorage.getItem(filePrefix + index))
    }
    files = readFiles;
    repopulateFileDisp();
    loadIndex()
}

const addFile = (fileObj) => {
    const index = fileObj.series
    
    if (files[index] !== undefined ) {
        console.log("series match, comparing dates")
        if (files[index].date >= fileObj.date) {
            console.log("dropping new file that is not newer")
            return
        }
        //TODO: warn in UI for overwrite
        console.log("Replacing file of " + files[index].rows.length + " rows, with " + fileObj.rows.length)
    }
    files[index] = fileObj;
    localStorage.setItem(indexKey, JSON.stringify(Object.keys(files)))
    localStorage.setItem(filePrefix + index, JSON.stringify(fileObj));
    repopulateFileDisp();
    loadIndex()
}

const deleteFile = (fileIndex) => {
    if (delete files[fileIndex]) {
        console.log("delete success")
    } else {
        console.log("delete failure")
    }
    console.log("post deleting", fileIndex, files)
    localStorage.removeItem(filePrefix + fileIndex)
    localStorage.setItem(indexKey, JSON.stringify(Object.keys(files)))

    repopulateFileDisp();
    loadIndex()
}

const repopulateFileDisp = () => {
    const filesDisp = document.getElementById('added-files');
    filesDisp.innerHTML = "";
    if (Object.keys(files).length > 0) {
        for (const [key, value] of Object.entries(files)) {
            const btn = document.createElement('button');
            btn.textContent = value.name;
            btn.addEventListener('click', () => {
                console.log("selected delete", key)
                deleteFile(key);
            });
            filesDisp.appendChild(btn);
        }
        document.getElementById('files-disp').removeAttribute('hidden');
    } else {
        document.getElementById('files-disp').setAttribute('hidden', ''); 
    }
}

//expensive iteration over all loaded files
const loadIndex = () => {
    lookupTable = {}
    for (const [key, value] of Object.entries(files)) {
        for (row of value.rows) {
            const upperIndex = row.identifier.toUpperCase()
            if (!lookupTable[upperIndex]) {
                lookupTable[upperIndex] = {}
            }

            lookupTable[upperIndex][key] = true
        }
    }
    console.log("Lookup table", lookupTable)
}

// TODO: Adding file twice deletes other file???

//files get processed into a Dataset object with properties
//name: string userset, fallback to filename
//series: string, replacement index
//date: date
//lines: 

const submitFile = (e) => {
    e.preventDefault();

    const fileName = e.target.fileinput.files[0].name 
    const inputName = document.forms["FileInput"]["datasetName"].value

    const datasetName = inputName ? inputName : fileName

    console.log("Dataset name", datasetName)
    const reader = new FileReader();

    reader.onload = (event) => {
        const fileObj = dataSetFromCSV(event.target.result, datasetName)
        console.log("Parsed result", fileObj)
        try {
            addFile(fileObj);
        } catch(err) {
            //TODO: present this in the UI
            console.log("failed to process file with error", err)
        }
        
    };

    reader.readAsText(e.target.fileinput.files[0]);
}

const tableBreak = "table begins"
const seriesKey = "series"
const dateKey = "date"
const dataSetFromCSV = (f, n) => {
    let result = parse(f)
    console.log("parse result", result)

    var keysValues = {}
    var columnLineNo = undefined
    //read kv pairs until we reach the delimeter
    for (var lineNo = 0; lineNo < result.length; lineNo++) {
        //ipnore empty lines
        if (result[lineNo][0] == undefined) {
            console.log("row with empty leading value")
            continue
        }
        if (tableBreak.localeCompare(result[lineNo][0], undefined, { sensitivity: 'base' } ) == 0 ) {
            columnLineNo = lineNo + 1
            break
        }

        //otherwise, process as key
        if (result[lineNo][1] == undefined) {
            console.log("row with empty leading value")
            continue
        }
        if (seriesKey.localeCompare(result[lineNo][0], undefined, { sensitivity: 'base' } ) == 0) {
            keysValues[seriesKey] = result[lineNo][1]
        } else if (dateKey.localeCompare(result[lineNo][0], undefined, { sensitivity: 'base' } ) == 0 ) {
            keysValues[dateKey] = result[lineNo][1]
        }
     }

    if (columnLineNo === undefined) {
        console.log("no table start marker found, assuming table starts at 0")
        columnLineNo = 0
    }
    if (columnLineNo + 1 === result.length) {
        throw new Error("no content found in file", columnLineNo,  result.length)
    }

    let dateValue = keysValues[dateKey] === undefined ? undefined : Date.parse(keysValues[dateKey])
    let seriesValue = keysValues[seriesKey] === undefined ? crypto.randomUUID() : keysValues[seriesKey]

    var rows = []
    for (var valueRow = columnLineNo + 1; valueRow < result.length; valueRow++) {
        const row = result[valueRow]
        if (row === undefined) { continue }
        //treat the leading row as identifier
        if (row[0] === undefined) { continue }

        rows.push( {identifier: row[0].replace(/ /g,'')  } )
    }

    return {
        name: n, //for display
        date: (dateValue === undefined) ? Date.now() : dateValue,
        series: seriesValue, //for deduping
        columns: result[columnLineNo], //keys
        rows: rows 
    }
}

const clearResults = () => {
    document.getElementById('results-content').innerHTML = "";
    document.getElementById('results').style.setProperty('display', 'none');
}

const changedSearch = () => {
    const searchValue = document.forms["SearchInput"]["searchField"].value
    
    if (!searchValue) { 
        clearResults()
        return
    }

    if (searchValue.length < 2) { 
        clearResults()
        return
    }

     const matchingIdentifiers = Object.keys(lookupTable)
        .filter( (identifier) => identifier.includes(searchValue.toUpperCase()) )
    console.log("matching results", matchingIdentifiers)
    showResults(matchingIdentifiers)
}

const showResults = (matches) => {
    const display_div = document.getElementById('results-content');
    display_div.innerHTML = "";

    const para = document.createElement('p')
    para.textContent = "Found " + matches.length + " results"
    para.style.color =  "white"
    display_div.appendChild(para);

    console.log("matches", matches)
    if (matches.length  < maxResults) {
        for (result of matches) {
            console.log("results row", result)
            const row = document.createElement('p')
            row.textContent = result
            row.style.color =  "white"
            display_div.appendChild(row)
        }
    }

    display_div.appendChild(document.createElement('hr'));

    document.getElementById('results').style.removeProperty('display');
}

const maxResults = 5
const searchFiles = (e) => {
    changedSearch()
}

//RFC compliant CSV parser - replace with server hosted
//inline the code
/**
 * Parse takes a string of CSV data and converts it to a 2 dimensional array
 *
 * options
 * - typed - infer types [false]
 *
 * @static
 * @param {string} csv the CSV string to parse
 * @param {Object} [options] an object containing the options
 * @param {Function} [reviver] a custom function to modify the values
 * @returns {Array} a 2 dimensional array of `[entries][values]`
 */
function parse (csv, options, reviver = v => v) {
  const ctx = Object.create(null)
  ctx.options = options || {}
  ctx.reviver = reviver
  ctx.value = ''
  ctx.entry = []
  ctx.output = []
  ctx.col = 1
  ctx.row = 1

  const lexer = /"|,|\r\n|\n|\r|[^",\r\n]+/y
  const isNewline = /^(\r\n|\n|\r)$/

  let matches = []
  let match = ''
  let state = 0

  while ((matches = lexer.exec(csv)) !== null) {
    match = matches[0]

    switch (state) {
      case 0: // start of entry
        switch (true) {
          case match === '"':
            state = 3
            break
          case match === ',':
            state = 0
            valueEnd(ctx)
            break
          case isNewline.test(match):
            state = 0
            valueEnd(ctx)
            entryEnd(ctx)
            break
          default:
            ctx.value += match
            state = 2
            break
        }
        break
      case 2: // un-delimited input
        switch (true) {
          case match === ',':
            state = 0
            valueEnd(ctx)
            break
          case isNewline.test(match):
            state = 0
            valueEnd(ctx)
            entryEnd(ctx)
            break
          default:
            state = 4
            throw Error(`CSVError: Illegal state [row:${ctx.row}, col:${ctx.col}]`)
        }
        break
      case 3: // delimited input
        switch (true) {
          case match === '"':
            state = 4
            break
          default:
            state = 3
            ctx.value += match
            break
        }
        break
      case 4: // escaped or closing delimiter
        switch (true) {
          case match === '"':
            state = 3
            ctx.value += match
            break
          case match === ',':
            state = 0
            valueEnd(ctx)
            break
          case isNewline.test(match):
            state = 0
            valueEnd(ctx)
            entryEnd(ctx)
            break
          default:
            throw Error(`CSVError: Illegal state [row:${ctx.row}, col:${ctx.col}]`)
        }
        break
    }
  }

  // flush the last value
  if (ctx.entry.length !== 0) {
    valueEnd(ctx)
    entryEnd(ctx)
  }

  return ctx.output
}

/**
 * Stringify takes a 2 dimensional array of `[entries][values]` and converts them to CSV
 *
 * options
 * - eof - add a trailing newline at the end of file [true]
 *
 * @static
 * @param {Array} array the input array to stringify
 * @param {Object} [options] an object containing the options
 * @param {Function} [replacer] a custom function to modify the values
 * @returns {string} the CSV string
 */
function stringify (array, options = {}, replacer = v => v) {
  const ctx = Object.create(null)
  ctx.options = options
  ctx.options.eof = ctx.options.eof !== undefined ? ctx.options.eof : true
  ctx.row = 1
  ctx.col = 1
  ctx.output = ''

  const needsDelimiters = /"|,|\r\n|\n|\r/

  array.forEach((row, rIdx) => {
    let entry = ''
    ctx.col = 1
    row.forEach((col, cIdx) => {
      if (typeof col === 'string') {
        col = col.replace(/"/g, '""')
        col = needsDelimiters.test(col) ? `"${col}"` : col
      }
      entry += replacer(col, ctx.row, ctx.col)
      if (cIdx !== row.length - 1) {
        entry += ','
      }
      ctx.col++
    })
    switch (true) {
      case ctx.options.eof:
      case !ctx.options.eof && rIdx !== array.length - 1:
        ctx.output += `${entry}\n`
        break
      default:
        ctx.output += `${entry}`
        break
    }
    ctx.row++
  })

  return ctx.output
}

/** @private */
function valueEnd (ctx) {
  const value = ctx.options.typed ? inferType(ctx.value) : ctx.value
  ctx.entry.push(ctx.reviver(value, ctx.row, ctx.col))
  ctx.value = ''
  ctx.col++
}

/** @private */
function entryEnd (ctx) {
  ctx.output.push(ctx.entry)
  ctx.entry = []
  ctx.row++
  ctx.col = 1
}

/** @private */
function inferType (value) {
  const isNumber = /.\./

  switch (true) {
    case value === 'true':
    case value === 'false':
      return value === 'true'
    case isNumber.test(value):
      return parseFloat(value)
    case isFinite(value):
      return parseInt(value)
    default:
      return value
  }
}
