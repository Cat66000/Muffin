/* eslint-disable max-len */
const _ = require("lodash");
const Err = require("./MuffinError");

const _readyCheck = Symbol("readyCheck");
const _typeCheck = Symbol("typeCheck");

class Piece {

    /**
     * @class
     * @protected
     * @classdesc An object similar to Map but without cache, used to interact with the database
     * @description Initialize a new Piece.
     * @param {Collection} base - The [Collection]{@link https://mongodb.github.io/node-mongodb-native/3.3/api/Collection.html} from MongoDB
     * @param {MuffinClient} client - The client that instantiated the Piece
     */
    constructor(base, client) {
        this._base = base;
        this.client = client;
    }

    [_readyCheck]() {
        if (this.client.isClosed === true) throw new Err("the database has been closed", "MuffinClosedError");
    }

    [_typeCheck](key) {
        return ["Number", "String", "Object"].includes(key.constructor.name);
    }

    /**
     * @async
     * @description Sets a document into the database
     * @param {*} key - The key of the document to set
     * @param {*} val - The value of the document to set into the database
     * @param {string} [path=null] - The path to the property to modify inside the value. Can be a dot-separated path, such as "prop1.subprop2.subprop3"
     * @returns {Promise<void>} A promise
     */
    async set(key, val, path) {
        this[_readyCheck]();

        if (_.isNil(key)) throw new Err("key is null or undefined");

        if (!this[_typeCheck](key)) key = key.toString();

        if (path) {
            const find = await this._base.findOne({ _id: key });

            console.log(find);
            val = _.set(find.value || {}, path, val);
        }

        await this._base.updateOne({ _id: key }, { $set: { _id: key, value: val } }, { upsert: true });
    }

    /**
     * @async
     * @description Finds a document in the database
     * @param {*} key - The key of the document to get
     * @param {string} [path=null] - The path to the property to modify inside the value. Can be a dot-separated path, such as "prop1.subprop2.subprop3"
     * @param {boolean} [raw=false] - If true, the method returns a promise containing the full object, i.e. : { _id: "foo", value: "bar" }
     * @returns {Promise<*>} If raw is false : a promise containing the value found in the database for this key.
     */
    async get(key, path, raw = false) {
        this[_readyCheck]();

        if (_.isNil(key)) return null;

        if (!this[_typeCheck](key)) key = key.toString();

        const find = await this._base.findOne({ _id: key });
        if (_.isNil(find)) return null;

        const data = find.value;
        if (_.isNil(data)) return null;

        if (raw) {
            return find;
        }

        if (path) {
            return _.get(data, path);
        } else {
            return data;
        }
    }

    /**
     * @async
     * @description Checks if a document exists
     * @param {*} key - The key of the document to check
     * @param {string} [path=null] - The path to the property to check. Can be a dot-separated path, such as "prop1.subprop2.subprop3"
     * @returns {Promise<boolean>} A promise
     */
    async has(key, path) {
        this[_readyCheck]();

        if (!this[_typeCheck](key)) key = key.toString();

        const find = await this._base.findOne({ _id: key });
        if (_.isNil(find)) return false;

        const data = find.value;
        if (_.isNil(data)) return false;

        if (path) {
            return _.has(data, path);
        }

        return true;
    }

    /**
     * @async
     * @description If the document doesn't exist : creates and returns it, else returns it
     * @param {*} key - The key to check if it exists or to set a document or a property inside the value
     * @param {*} val - The value to set if the key doesn't exist
     * @param {string} [path=null] - The path to the property to check. Can be a dot-separated path, such as "prop1.subprop2.subprop3"
     * @param {boolean} [raw=false] - If true, the method returns a promise containing the full object, i.e. : { _id: "foo", value: "bar" }
     * @returns {Promise<*>} If raw is false : a promise containing the value found in the database for this key.
     */
    async ensure(key, val, path, raw = false) {
        this[_readyCheck]();

        if (await this.has(key, path) === false) {
            await this.set(key, val, path);
        }

        return await this.get(key, path, raw);
    }

    // This method was mostly taken from Enmap... Licence : https://github.com/eslachance/enmap/blob/master/LICENSE
    /**
     * @async
     * @description Deletes a document in the database
     * @param {*} key - The key
     * @param {string} [path=null] - The path to the property to delete. Can be a dot-separated path, such as "prop1.subprop2.subprop3"
     * @returns {Promise<void>} A promise
     */
    async delete(key, path) {
        this[_readyCheck]();

        if (_.isNil(key)) throw new Err("key is null or undefined");

        if (!this[_typeCheck](key)) key = key.toString();

        if (path) {
            const find = await this._base.findOne({ _id: key });
            let data = find.value;
            if (_.isNil(find) || _.isNil(data)) return;

            path = _.toPath(path);
            const last = path.pop();
            const propValue = path.length ? _.get(data, path) : data;

            if (_.isArray(propValue)) {
                propValue.splice(last, 1);
            } else {
                delete propValue[last];
            }

            if (path.length) {
                _.set(data, path, propValue);
            } else {
                data = propValue;
            }

            await this._base.updateOne({ _id: key }, { $set: { _id: key, value: data } }, { upsert: true });
        } else {
            await this._base.deleteOne({ _id: key }, { single: true });
        }
    }

    /**
     * @async
     * @description Deletes all the documents
     * @returns {Promise<void>} A promise
     */
    async clear() {
        this[_readyCheck]();

        await this._base.deleteMany({});
    }

    /**
     * @returns {Array<*>} An array with the values of all the documents
     */
    valueArray() { return this._base.find({}).map(d => d.value).toArray(); }

    /**
     * @returns {Array<*>} An array with the keys of all the documents
     */
    keyArray() { return this._base.find({}).map(d => d._id).toArray(); }

    /**
     * @returns {Array<Object<*>>} An array with all the documents of the database
     */
    rawArray() { return this._base.find({}).toArray(); }

    /**
     * @returns {number} The size of the database
     */
    async size() { return await this._base.countDocuments(); }

}

module.exports = Piece;