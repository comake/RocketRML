const xpath = require('xpath');
const prefixhelper = require('../helper/prefixHelper.js');
const objectHelper = require('../helper/objectHelper.js');
const functionHelper = require('../function/function.js');
const logicalSource = require('../input-parser/logicalSourceParser.js');
const helper = require('./helper.js');


let count = 0;
const parseXML = (data, currObject, prefixes, source, iterator, options) => {
  count = 0;
  const doc = helper.readFileXML(source, options);
  return iterateDom(data, currObject, prefixes, iterator, doc, iterator, options);
};

const iterateDom = (data, currObject, prefixes, iterator, doc, nextIterator, options) => {
  // check if it is a function
  if (currObject.functionValue) {
    const functionMap = prefixhelper.checkAndRemovePrefixesFromObject(objectHelper.findIdinObjArr(data, currObject.functionValue['@id']), prefixes);
    const definition = functionHelper.findDefinition(data, functionMap.predicateObjectMap, prefixes);
    const parameters = functionHelper.findParameters(data, functionMap.predicateObjectMap, prefixes);
    parameters.forEach((p) => {
      p.data = `${iterator}/${p.data}`;
    });
    const calcParameters = helper.calculateParameters(doc, parameters, 'XPath');
    return functionHelper.executeFunction(definition, calcParameters, options);
  }
  // get subjectMap
  const subjectMapId = currObject.subjectMap['@id'];
  if (!subjectMapId) {
    throw ('Error: one subjectMap needed!');
  }
  const subjectMap = prefixhelper.checkAndRemovePrefixesFromObject(objectHelper.findIdinObjArr(data, subjectMapId), prefixes);

  // get all possible things in subjectmap
  let iteratorNodes;
  if (iterator === undefined) {
    iteratorNodes = doc;
    if (!iteratorNodes.length) {
      iteratorNodes = [iteratorNodes];
    }
  } else {
    iteratorNodes = xpath.select(iterator, doc);
  }

  iteratorNodes = helper.addArray(iteratorNodes);
  let result = [];

  let type;
  if (subjectMap.class) {
    if (Array.isArray(subjectMap.class)) {
      type = [];
      subjectMap.class.forEach((sm) => {
        type.push(prefixhelper.replacePrefixWithURL(sm['@id'], prefixes));
      });
    } else {
      type = prefixhelper.replacePrefixWithURL(subjectMap.class['@id'], prefixes);
    }
  }
  const functionMap = objectHelper.findIdinObjArr(data, type);
  let idTemplate;
  if (subjectMap.template) {
    idTemplate = subjectMap.template;
  }
  let reference;
  if (subjectMap.reference) {
    reference = subjectMap.reference;
  }

  let constant;
  if (subjectMap.constant) {
    constant = subjectMap.constant;
  }

  if (reference) {
    iteratorNodes.forEach((n, i) => {
      let obj = {};
      count++;
      if (functionMap) {
        // the subjectMapping contains a functionMapping
        const node = helper.cutArray(xpath.select(`(${iterator})` + `[${i + 1}]`, doc));
        type = helper.subjectFunctionExecution(functionMap, node, prefixes, data, 'XPath');
      }
      const nodes = xpath.select(`(${iterator})` + `[${i + 1}]` + `/${reference}`, doc);
      nodes.forEach((node) => {
        if (type) {
          obj['@type'] = type;
        }
        let temp;
        if (node.firstChild && node.firstChild.data) {
          temp = node.firstChild.data;
        } else if (node.nodeValue) {
          temp = node.nodeValue;
        }
        temp = helper.isURL(temp) ? temp : helper.addBase(temp, prefixes);
        if (temp.indexOf(' ') === -1) {
          obj['@id'] = temp;
          const p = `(${iterator})` + `[${i + 1}]`;
          obj = doObjectMappings(currObject, data, p, prefixes, doc, obj, options);

          if (!obj['@id']) {
            obj['@id'] = `${currObject['@id']}_${count}`;
          }
          obj.$iter = p;
          obj.$ql = 'XPath';
          result.push(obj);
        }
      });
    });
  } else if (idTemplate) {
    count++;
    iteratorNodes.forEach((n, i) => {
      let obj = {};
      const p = `(${iterator})` + `[${i + 1}]`;
      const ids = calculateTemplate(doc, p, idTemplate, prefixes);
      ids.forEach((id) => {
        if (subjectMap.termType) {
          switch (subjectMap.termType['@id']) {
            case 'rr:BlankNode':
              id = `_:${id}`;
              break;
            case 'rr:IRI':
              if ((!idTemplate && !reference) || (idTemplate && reference)) {
                throw ('Must use exactly one of - rr:template and rr:reference in SubjectMap!');
              }
              if (!helper.isURL(id)) {
                id = helper.addBase(id, prefixes);
              }
              break;
            case 'rr:Literal':
              throw ('Cannot use literal in SubjectMap!');
            default:
              throw (`Don't know: ${subjectMap.termType['@id']}`);
          }
        }
        if (functionMap) {
          // the subjectMapping contains a functionMapping
          const node = helper.cutArray(xpath.select(`(${iterator})` + `[${i + 1}]`, doc));
          type = helper.subjectFunctionExecution(functionMap, node, prefixes, data, 'XPath');
        }
        obj['@id'] = id;
        if (type) {
          obj['@type'] = type;
        }
        obj = doObjectMappings(currObject, data, `(${iterator})` + `[${i + 1}]`, prefixes, doc, obj, options);
        if (!obj['@id']) {
          obj['@id'] = `${currObject['@id']}_${count}`;
        }
        obj.$iter = p;
        obj.$ql = 'XPath';
        result.push(obj);
      });
    });
  } else {
    // BlankNode with no template or id
    iteratorNodes.forEach((n, i) => {
      count++;
      if (functionMap) {
        // the subjectMapping contains a functionMapping
        const node = helper.cutArray(xpath.select(`(${iterator})` + `[${i + 1}]`, doc));
        type = helper.subjectFunctionExecution(functionMap, node, prefixes, data, 'XPath');
      }
      const p = `(${iterator})` + `[${i + 1}]`;
      const nodes = xpath.select(p, doc);
      let obj = {};
      nodes.forEach(() => {
        if (constant) {
          obj['@id'] = helper.getConstant(constant, prefixes);
        }
        if (type) {
          obj['@type'] = type;
        }
        obj = doObjectMappings(currObject, data, `(${iterator})` + `[${i + 1}]`, prefixes, doc, obj, options);
        if (!obj['@id']) {
          obj['@id'] = `${currObject['@id']}_${count}`;
        }
        obj.$iter = p;
        obj.$ql = 'XPath';
        result.push(obj);
      });
    });
  }

  result = helper.cutArray(result);
  return result;
};

let doObjectMappings = (currObject, data, iterator, prefixes, doc, obj, options) => {
  // find objectMappings
  if (currObject.predicateObjectMap) {
    let objectMapArray = currObject.predicateObjectMap;
    objectMapArray = helper.addArray(objectMapArray);
    objectMapArray.forEach((o) => {
      const id = o['@id'];
      const mapping = prefixhelper.checkAndRemovePrefixesFromObject(objectHelper.findIdinObjArr(data, id), prefixes);
      let predicate;
      if (mapping.predicate) {
        if (Array.isArray(mapping.predicate)) {
          predicate = [];
          mapping.predicate.forEach((pre) => {
            predicate.push(prefixhelper.replacePrefixWithURL(pre['@id'], prefixes));
          });
        } else {
          predicate = prefixhelper.replacePrefixWithURL(mapping.predicate['@id'], prefixes);
        }
      } else if (mapping.predicateMap) {
        // in predicateMap only constant allowed
        if (Array.isArray(mapping.predicateMap)) {
          predicate = [];
          for (const t of mapping.predicateMap) {
            let temp = prefixhelper.checkAndRemovePrefixesFromObject(objectHelper.findIdinObjArr(data, t['@id']), prefixes);
            temp = temp.constant['@id'];
            predicate.push(temp);
          }
        } else {
          predicate = prefixhelper.checkAndRemovePrefixesFromObject(objectHelper.findIdinObjArr(data, mapping.predicateMap['@id']), prefixes);
          predicate = helper.getConstant(predicate.constant, prefixes);
        }
      } else {
        throw ('Error: no predicate specified!');
      }
      if (Array.isArray(predicate)) {
        for (const p of predicate) {
          handleSingleMapping(obj, mapping, p, prefixes, data, doc, iterator, options);
        }
      } else {
        handleSingleMapping(obj, mapping, predicate, prefixes, data, doc, iterator, options);
      }
    });
  }
  obj = helper.cutArray(obj);
  return obj;
};

/*
data: the data to insert
path: the actual jsonpath
predicate: the predicate to write to (obj[predicate]=data)
mapping: the actual mapping
prefixes: all prefixes
obj: the result object
doc:the whole file
 */


const handleSingleMapping = (obj, mapping, predicate, prefixes, data, doc, path, options) => {
  predicate = prefixhelper.replacePrefixWithURL(predicate, prefixes);
  let object;
  if (mapping.object) {
    object = {
      '@id': prefixhelper.replacePrefixWithURL(mapping.object['@id'], prefixes),
    };
  }
  let objectmap;
  if (mapping.objectMap) {
    objectmap = prefixhelper.checkAndRemovePrefixesFromObject(objectHelper.findIdinObjArr(data, mapping.objectMap['@id']), prefixes);
  }
  // check if it is an object or an objectMap and handle differently
  if (object) {
    helper.addToObj(obj, predicate, object);
  } else {
    const reference = objectmap.reference;
    let constant = objectmap.constant;
    const language = objectmap.language;
    const datatype = objectmap.datatype;
    const template = objectmap.template;
    const termtype = objectmap.termType;

    if (template) {
      // we have a template definition
      const temp = calculateTemplate(doc, path, template, prefixes);
      temp.forEach((t) => {
        if (termtype) {
          switch (termtype['@id']) {
            case 'rr:BlankNode':
              t = {
                '@id': `_:${t}`,
              };
              break;
            case 'rr:IRI':
              if (!helper.isURL(t)) {
                t = {
                  '@id': helper.addBase(t, prefixes),
                };
              } else {
                t = {
                  '@id': t,
                };
              }
              break;
            case 'rr:Literal':
              break;
            default:
          }
        } else {
          t = {
            '@id': t,
          };
        }
        helper.setObjPredicate(obj, predicate, t, language, datatype);
      });
    } else if (reference) {
      // we have a reference definition
      let arr = getData(`${path}/${reference}`, doc);
      if (arr && arr.length > 0) {
        arr = helper.cutArray(arr);
        helper.setObjPredicate(obj, predicate, arr, language, datatype);
      }
    } else if (constant) {
      // we have a constant definition
      constant = helper.cutArray(constant);
      constant = helper.getConstant(constant,prefixes);
      helper.setObjPredicate(obj, predicate, constant, language, datatype);
    } else if (objectmap.parentTriplesMap && objectmap.parentTriplesMap['@id']) {
      // we have a parentTriplesmap
      const nestedMapping = prefixhelper.checkAndRemovePrefixesFromObject(objectHelper.findIdinObjArr(data, objectmap.parentTriplesMap['@id']), prefixes);
      if (nestedMapping.functionValue) {
        const temp = prefixhelper.checkAndRemovePrefixesFromObject(objectHelper.findIdinObjArr(data, nestedMapping.functionValue['@id']), prefixes);
        if (!temp.logicalSource) {
          throw (`${temp['@id']} has no logicalSource`);
        }
        const nextsource = logicalSource.parseLogicalSource(data, prefixes, temp.logicalSource['@id']);
        if (obj[predicate]) {
          obj[predicate] = helper.addArray(obj[predicate]);
          obj[predicate].push(iterateDom(data, nestedMapping, prefixes, nextsource.iterator, doc, options));
        } else {
          obj[predicate] = iterateDom(data, nestedMapping, prefixes, nextsource.iterator, doc, options);
        }
      } else {
        if (!obj.$parentTriplesMap) {
          obj.$parentTriplesMap = {};
        }
        let jc;
        if (objectmap.joinCondition) {
          jc = objectmap.joinCondition['@id'];
        }
        if (obj.$parentTriplesMap[predicate]) {
          const temp = obj.$parentTriplesMap[predicate];
          obj.$parentTriplesMap[predicate] = [];
          obj.$parentTriplesMap[predicate].push(temp);
          obj.$parentTriplesMap[predicate].push({
            joinCondition: jc,
            mapID: objectmap['@id'],
          });
        } else {
          obj.$parentTriplesMap[predicate] = {
            joinCondition: jc,
            mapID: objectmap['@id'],
          };
        }
      }
    }
  }
};

const getData = (path, object) => {
// make the xpath query
  const temp = xpath.select(path, object);
  let arr = [];
  temp.forEach((n) => {
    if (n.nodeValue) {
      arr.push(n.nodeValue);
    } else {
      const children = n.childNodes;
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const c = children[i];
          if (c.data) {
            arr.push(c.data);
          }
        }
      }
    }
  });
  if (arr.length > 0) {
    arr = helper.cutArray(arr);
    return arr;
  }
  return undefined;
};


const calculateTemplate = (file, path, template, prefixes) => {
  const beg = helper.locations('{', template);
  const end = helper.locations('}', template);
  const words = [];
  const toInsert = [];
  const templates = [];
  for (const i in beg) {
    words.push(template.substr(beg[i] + 1, end[i] - beg[i] - 1));
  }
  words.forEach((w) => {
    const temp = helper.addArray(getData(`${path}/${w}`, file));
    toInsert.push(temp);
  });
  const allComb = helper.allPossibleCases(toInsert);
  for (const combin in allComb) {
    let finTemp = template;
    for (const found in allComb[combin]) {
      finTemp = finTemp.replace(`{${words[found]}}`, helper.toURIComponent(allComb[combin][found]));
    }
    templates.push(finTemp);
  }
  for (const t in templates) {
    templates[t] = helper.replaceEscapedChar(prefixhelper.replacePrefixWithURL(templates[t], prefixes));
  }
  return templates;
};

module.exports.parseXML = parseXML;
module.exports.getData = getData;
