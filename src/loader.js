const path = require('path');
const fs = require('fs');
const TJS = require('typescript-json-schema');

let tjsGenerator;

// https://stackoverflow.com/questions/20817618/is-there-a-splice-method-for-strings
function spliceStr(str, index, count, add) {
    return str.slice(0, index) + (add || '') + str.slice(index + count);
}

function schemaToStr(schema) {
    return '{\n' + Object.keys(schema).map((key) => {
        if(key === 'definitions') {
            return '  "definitions": {\n' + Object.keys(schema[key]).map((defKey) => {
                return '"' + defKey + '": ' + schema[key][defKey];
            }).join(',\n') + '\n}';
        } else {
            return '  "' + key + '": ' + JSON.stringify(schema[key], null, 2);
        }
    }).join(',\n') + '\n}';
}

module.exports = function loader(source, map, meta) {
    const callback = this.async();
    const options = this.getOptions();
    const validateImportRegex = /import\s+?(?:(?:([\w*\s{},]*)\s+from\s+?)|)(?:(?:"ts-validate-schema")|(?:'ts-validate-schema'))[\s]*?(?:;|$|)/;
    const validateImportMatchResults = source.match(validateImportRegex);

    if(!validateImportMatchResults || !validateImportMatchResults[1]) {
        callback(null, source);
        return;
    }

    this.cacheable(false); // TODO

    let validateFnAlias;

    const importAllResults = validateImportMatchResults[1].match(/\s*\*\sas\s*(\w*)/);

    if(importAllResults && importAllResults[1]) {
        validateFnAlias = importAllResults[1] + '\.validate';
    } else {
        const namedAliasImportResults = validateImportMatchResults[1].match(/\s*{.*validate\s*as\s*(\w*)[,\s]*.*}\s*/);
        if(namedAliasImportResults && namedAliasImportResults[1]) {
            validateFnAlias = namedAliasImportResults[1];
        } else {
            const namedImportResults = validateImportMatchResults[1].match(/\s*{.*validate.*}\s*/);
            if(namedImportResults) {
                validateFnAlias = 'validate';
            }
        }
    }

    if(!validateFnAlias) {
        throw new Error('Found validate import but cannot find alias');
    }

    // TODO : something smarter to handle corner cases like comments, assertions, scopes, ...
    const validateMatchResults = source.matchAll(new RegExp(validateFnAlias + '<(.*?)>\\((.*?)\\)', 'g'));

    if(!validateMatchResults || validateMatchResults.length === 0) {
        callback(null, source);
        return;
    }

    // optionally pass argument to schema generator
    const settings = {
        uniqueNames: true,
        // TODO settings from config
    };

    const tsConfigFile = options.configFile || './tsconfig.json';
    const tsconfig = JSON.parse(fs.readFileSync(tsConfigFile)); // TODO handle errors + TODO allow coma at the end of line

    const program = TJS.getProgramFromFiles(
        [path.relative(this.context, this.resourcePath)],
        tsconfig.compilerOptions,
        this.context
    );

    if(!tjsGenerator) {
        tjsGenerator = TJS.buildGenerator(program, settings);
    }

    const getSchemaId = (schemaName) => {
        const splitted = schemaName.split('.');
        return splitted[splitted.length - 1];
    };

    const createSchemaFile = (schemaId, schema) => {

        const schemaPath = path.join(this.context, 'schemas/' + schemaId + '.schema.ts');

        if(!fs.existsSync(schemaPath)) {

            const schemaDir = path.join(this.context, 'schemas');
            if (!fs.existsSync(schemaDir)) {
                fs.mkdirSync(schemaDir);
            }

            const imports = [];

            Object.keys(schema.definitions || {}).forEach((defKey) => {
                const subSchemaId = getSchemaId(defKey);
                createSchemaFile(subSchemaId, schema.definitions[defKey]);
                imports.push(
                    'import { Schema' + subSchemaId + ' } from \'./' + subSchemaId+ '.schema\';'
                );
            });

            const formattedSchema = Object.assign({}, schema, {
                definitions: Object.keys(schema.definitions || {}).reduce((acc, curr) => {
                    let importedDef = {};
                    importedDef[curr] = 'Schema' + getSchemaId(curr);
                    return Object.assign({}, acc, importedDef);
                }, {})
            });

            fs.writeFileSync(schemaPath,
                imports.join('\n') + '\n' +
                'export const Schema' + schemaId + ' = ' + schemaToStr(formattedSchema) + ';'
            );
        }

        return schemaPath;
    }

    const createSchemaForType = (type) => {

        const schema = TJS.generateSchema(program, type, settings, [], tjsGenerator);
        // find symbol to get the symbol id
        const symbol = tjsGenerator.getSymbols().find((s) => {
            return s.typeName === type &&
                (
                    path.resolve(this.context, (s.fullyQualifiedName.substr(1, s.fullyQualifiedName.length - s.typeName.length - 3) + '.ts')) ===
                    this.resourcePath
                )
        })

        if(!symbol) {
            throw new Error('Cannot find symbol for type : ' + type);
        }

        const schemaId = getSchemaId(symbol.name);

        return {
            schemaId: schemaId,
            path: createSchemaFile(schemaId, schema)
        };
    }

    const schemaImports = [];

    Array.from(validateMatchResults).forEach((matchResult) => {

        const type = matchResult[1];

        if(!type) {
            return;
        }

        const schemaDef = createSchemaForType(type);
        let relativePath = './' + path.relative(path.dirname(this.resourcePath), schemaDef.path);
        relativePath = relativePath.substr(0, relativePath.length - 3);
        schemaImports.push('import { Schema' + schemaDef.schemaId + ' } from \'' + relativePath + '\';');

        this.addDependency(schemaDef.path);

        source = spliceStr(source, matchResult.index, matchResult[0].length,
            matchResult[0].substr(0, matchResult[0].length - 1) + ', Schema' + schemaDef.schemaId + ')'
        );
    });

    callback(null, schemaImports.join('\n') + '\n' + source, map, meta);
}
