import {parse} from "./csv.js"

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