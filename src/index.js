const { Validator } = require("jsonschema");

module.exports = {
    validate: function(value, schema) {
        if(!schema) {
            throw 'Validate function should be used with a generic type'; // TODO rewording
        }
        return new Validator().validate(value, schema);
    }
}
