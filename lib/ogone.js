require('sugar');

var crypto = require('crypto');
const axios = require('axios');

var request = require('request');
var qs = require('querystring');
var xml2js = require('xml2js');
var JSONSchema = require('json-schema');

function amountFormator(value) {
    return Math.round(value * 100);
}

function OgoneError(response) {
    this.name = "OgoneError";
    this.message = "NCError: " + response.ncerror || "Unknown";
    this.response = response;
}

OgoneError.prototype = new Error();
OgoneError.prototype.constructor = OgoneError;

function Ogone(mode, defaults) {
    if (Object.isObject(mode)) {
        defaults = mode;
        mode = null;
    }
    this.defaults = defaults || {};
    if (mode && !~['test', 'prod'].indexOf(mode)) throw new Error("Unknown mode: " + mode);
    this.mode = mode || 'test';
}

Ogone.prototype.createOrderRequest = function(json, algorithm, key) {
    json = json || {};
    Object.merge(json, this.defaults, true);
    return new OrderRequest(this.mode, json, algorithm, key);
};

Ogone.prototype.createMaintenanceOrder = function(json) {
    json = json || {};
    Object.merge(json, this.defaults, true);
    return new MaintenanceRequest(this.mode, json);
};

Ogone.prototype.createQueryRequest = function(json) {
    json = json || {};
    Object.merge(json, this.defaults, true);
    return new QueryRequest(this.mode, json);
};

Ogone.prototype.createAliasOrderRequest = function(json, algorithm, key) {
    json = json || {};
    Object.merge(json, this.defaults, true);
    return new AliasOrderRequest(this.mode, json, algorithm, key);
};


function Request(url, json, schema) {
    Object.merge(schema || {}, {
        type: 'object',
        properties: {
            pspid: {
                type: 'string',
                required: true
            },
            pswd: {
                type: 'string',
                required: true
            },
            userid: {
                type: 'string',
                required: true
            }
        }
    }, true);
    var result = JSONSchema.validate(json, schema);
    if (!result.valid) throw new Error(result.errors);
    this.query = Object.clone(json) || {};
    this.url = url;
    this.parser = new xml2js.Parser(xml2js.defaults['0.1']);
}

Request.prototype.operation = async function (operation, callback) {
    this.query.operation = operation;
    return await this._send(callback);
};

Request.prototype._prepare = function(query) {
    return Request.upper(query);
};

Request.prototype._send = async function (callback) {
    var prepared = this._prepare(this.query);
    if (prepared instanceof Error) return callback(prepared);
    var body = Request.stringify(prepared);
    const {data} = await axios.post(this.url, body, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    if (data) {
        return new Promise((resolve, reject) => {
            this.parser.parseString(data, function (err, result) {
                if (err) {
                    reject(err);
                };
                if (!result['@']) {
                    reject(result);
                };
                if (result['HTML_ANSWER']) {
                    result['@'].html_answer = result['HTML_ANSWER'];
                }
                var normalize = Request.lower(result['@']);
                if (normalize.ncerror && normalize.ncerror !== '0') {
                    resolve(new OgoneError(normalize));
                }
                resolve(callback(null, normalize));
            })
        })
    }
};

Request.stringify = function(obj) {
    var prepared = {};
    Object.keys(obj).each(function(key) {
        prepared[key] = obj[key] ? obj[key].toString() : '';
    });
    return qs.stringify(prepared);
}

Request.normalize = function(method, obj) {
    var result = {};
    Object.keys(obj).map(function(key) {
        var normalized = key[method]();
        if (result[normalized]) {
            throw new Error("Can not normalize cause of key: " + key);
        }
        result[normalized] = obj[key];
    });
    return result;
};

Request.lower = Request.normalize.bind(this, 'toLowerCase');
Request.upper = Request.normalize.bind(this, 'toUpperCase');

function OrderRequest(mode, json, algorithm, key) {
    var schema = {
        type: 'object',
        properties: {
            orderid: {
                type: ['string', 'number'],
                required: true
            },
            amount: {
                type: 'number',
                required: true
            },
            currency: {
                type: 'string',
                'default': 'EUR',
                required: true
            },
            brand: {
                type: 'string',
                required: true
            },
            cardno: {
                type: 'string',
                required: true
            },
            ed: {
                type: 'string',
                required: true
            },
            cvc: {
                type: 'string',
                required: true
            },
            com: {
                type: 'string'
            },
            cn: {
                type: 'string'
            },
            email: {
                type: 'string'
            },
            ownerAddress: {
                type: 'string'
            },
            ownerZip: {
                type: 'string'
            },
            ownerCity: {
                type: 'string'
            },
            ownerZip: {
                type: 'string'
            },
            ownerTelno: {
                type: 'string'
            },
            globOrderId: {
                type: 'string'
            },
            remote_address: {
                type: 'string'
            },
            rtimeout: {
                type: 'string'
            },
            eci: {
                type: ['string', 'number']
            },
            alias: {
                type: ['string', 'number']
            },
            aliasusage: {
                type: 'string'
            }
        }
    };
    json.amount = amountFormator(json.amount);
    Request.call(this, 'https://secure.ogone.com/ncol/' + mode + '/orderdirect.asp', json, schema);
    this.algorithm = algorithm;
    this.key = key;
}

OrderRequest.prototype.__proto__ = Request.prototype;
OrderRequest.constructor = OrderRequest;

OrderRequest.prototype._prepare = function(query) {
    if (this.algorithm && this.key) {
        query.shasign = OrderRequest.hashify(this.algorithm, this.key, query);
    }
    return Request.prototype._prepare.apply(this, [query]);
};

OrderRequest.hashify = function(algorithm, key, obj) {
    var shasum = crypto.createHash(algorithm);
    var token = Object.keys(obj).sort().map(function(key) {
        if (obj[key]) return key.toUpperCase() + "=" + obj[key];
    }).join(key) + key;
    return shasum.update(token).digest('hex').toUpperCase();
};

OrderRequest.prototype.res = Request.prototype.operation.fill('RES');
OrderRequest.prototype.sal = Request.prototype.operation.fill('SAL');
OrderRequest.prototype.rfd = Request.prototype.operation.fill('RFD');

function MaintenanceRequest(mode, json) {
    var schema = {
        type: 'object',
        properties: {
            payid: {
                type: ['string', 'number']
            },
            orderid: {
                type: ['string', 'number']
            },
            amount: {
                type: 'number',
                required: true
            }
        }
    };
    json.amount = amountFormator(json.amount);
    Request.call(this, 'https://secure.ogone.com/ncol/' + mode + '/maintenancedirect.asp', json, schema);
}

MaintenanceRequest.prototype.__proto__ = Request.prototype;
MaintenanceRequest.constructor = MaintenanceRequest;

MaintenanceRequest.prototype.ren = Request.prototype.operation.fill('REN');
MaintenanceRequest.prototype.del = Request.prototype.operation.fill('DEL');
MaintenanceRequest.prototype.des = Request.prototype.operation.fill('DES');
MaintenanceRequest.prototype.sal = Request.prototype.operation.fill('SAL');
MaintenanceRequest.prototype.sas = Request.prototype.operation.fill('SAS');
MaintenanceRequest.prototype.rfd = Request.prototype.operation.fill('RFD');
MaintenanceRequest.prototype.rfs = Request.prototype.operation.fill('RFS');


function QueryRequest(mode, json) {
    var schema = {
        type: 'object',
        properties: {
            payid: {
                type: ['string', 'number']
            }
        }
    };
    Request.call(this, 'https://secure.ogone.com/ncol/' + mode + '/querydirect.asp', json, schema);
}

QueryRequest.prototype.__proto__ = Request.prototype;
QueryRequest.constructor = QueryRequest;

QueryRequest.prototype.status = async function (callback) {
    return await this._send(callback);
};

Request.prototype.operation = async function (operation, callback) {
    this.query.operation = operation;
    return await this._send(callback);
};


function AliasOrderRequest(mode, json, algorithm, key) {
    var schema = {
        type: 'object',
        properties: {
            orderid: {
                type: ['string', 'number'],
                required: true,
                maxLength: 40
            },
            amount: {
                type: 'number',
                required: true
            },
            currency: {
                type: 'string',
                'default': 'EUR',
                required: true
            },
            alias: {
                type: ['string', 'number'],
                required: true
            },
            eci: {
                type: ['string', 'number'],
                required: true
            },
        }
    };
    json.amount = amountFormator(json.amount);
    Request.call(this, 'https://secure.ogone.com/ncol/' + mode + '/orderdirect.asp', json, schema);
    this.algorithm = algorithm;
    this.key = key;
}

AliasOrderRequest.prototype.__proto__ = Request.prototype;
AliasOrderRequest.constructor = AliasOrderRequest;
AliasOrderRequest.prototype._prepare = function(query) {
    if (this.algorithm && this.key) {
        query.shasign = AliasOrderRequest.hashify(this.algorithm, this.key, query);
    }
    return Request.prototype._prepare.apply(this, [query]);
};

AliasOrderRequest.hashify = function(algorithm, key, obj) {
    var shasum = crypto.createHash(algorithm);
    var token = Object.keys(obj).sort().map(function(key) {
        if (obj[key]) return key.toUpperCase() + "=" + obj[key];
    }).join(key) + key;
    return shasum.update(token).digest('hex').toUpperCase();
};

AliasOrderRequest.prototype.res = Request.prototype.operation.fill('RES');
AliasOrderRequest.prototype.sal = Request.prototype.operation.fill('SAL');
AliasOrderRequest.prototype.rfd = Request.prototype.operation.fill('RFD');



module.exports = Ogone;
module.exports.Request = Request;
module.exports.OrderRequest = OrderRequest;
module.exports.MaintenanceRequest = MaintenanceRequest;
module.exports.QueryRequest = QueryRequest;
module.exports.OgoneError = OgoneError;
module.exports.AliasOrderRequest = AliasOrderRequest;
