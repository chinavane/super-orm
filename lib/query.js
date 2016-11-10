'use strict';

/**
 * super-orm
 *
 * @author Zongmin Lei <leizongmin@gmail.com>
 */

const assert = require('assert');
const {
  sqlEscape, sqlEscapeId, sqlFormat,
  sqlFormatObject, sqlUpdateString, sqlLimitString,
} = require('./utils');


class QueryBuilder {

  /**
   * 创建 QueryBuilder
   *
   * @param {Object} options
   *   - {String} table
   *   - {Function} exec
   */
  constructor(options) {
    options = Object.assign({}, options || {});

    assert.ok(options.table, `must provide table name`);
    assert.ok(typeof options.table === 'string', `table name must be a string`);
    this._tableName = options.table;

    if (options.exec) {
      assert.ok(typeof options.exec === 'function', `exec callback must be a function`);
      this._execCallback = options.exec;
    } else {
      this._execCallback = null;
    }

    this._data = {
      fields: '*',
      conditions: [],
      type: '',
      update: null,
      insert: null,
      delete: null,
      sql: null,
      orderFields: '',
      orderBy: '',
      skipRows: 0,
      limitRows: 0,
      limit: '',
    };
  }

  /**
   * 格式化模板字符串
   *
   * @param {String} tpl
   * @param {Object|Array} values
   * @return {String}
   */
  format(tpl, values) {
    assert.ok(typeof tpl === 'string', `first parameter must be a string`);
    assert.ok(values && (Array.isArray(values) || typeof values === 'object'), 'second parameter must be an array or object');
    if (Array.isArray(values)) {
      return sqlFormat(tpl, values);
    }
    return sqlFormatObject(tpl, values);
  }

  /**
   * 查询条件
   * 支持的形式：
   *   where('aaa=1');
   *   where({ aaa: 1, bbb: 22 })
   *   where('aaa=:a AND bbb=:b', { a: 123, b: 456 })
   *   where('aaa=? AND bbb=?', [ 123, 456 ])
   *
   * @param {String|Object} condition
   * @param {Array|Object} values
   * @return {this}
   */
  where(condition, values) {
    const t = typeof condition;
    assert.ok(condition, `missing condition`);
    assert.ok(t === 'string' || t === 'object', `condition must be a string or object`);
    if (t === 'string') {
      this._data.conditions.push(this.format(condition, values || []));
    } else {
      for (const name in condition) {
        this._data.conditions.push(`${ sqlEscapeId(name) }=${ sqlEscape(condition[name]) }`);
      }
    }
    return this;
  }

  /**
   * 查询的字段
   *
   * @return {this}
   */
  select(...args) {
    assert.ok(this._data.type === '', `cannot change query type after it was set to "${ this._data.type }"`);
    this._data.type = 'SELECT';
    this._data.fields = args.map(name => {
      assert.ok(name && typeof name === 'string', `field name must be a string`);
      return sqlEscapeId(name);
    }).join(', ');
    return this;
  }

  /**
   * 更新
   * 支持的形式：
   *   update('a=a+1')
   *   update('a=:a+1', { a: 123 })
   *   update('a=?+1', [ 123 ])
   *   update({ a: 1 })
   *
   * @param {String|Object} update
   * @param {Array|Object} values
   * @return {this}
   */
  update(update, values) {
    assert.ok(this._data.type === '', `cannot change query type after it was set to "${ this._data.type }"`);
    this._data.type = 'UPDATE';
    const t = typeof update;
    assert.ok(update, `missing update data`);
    assert.ok(t === 'string' || t === 'object', `first parameter must be a string or array`);
    if (t === 'string') {
      this._data.update = this.format(update, values || []);
    } else {
      this._data.update = sqlUpdateString(update);
    }
    return this;
  }

  /**
   * 插入
   *
   * @param {Object|Array} data
   * @return {this}
   */
  insert(data) {
    assert.ok(this._data.type === '', `cannot change query type after it was set to "${ this._data.type }"`);
    this._data.type = 'INSERT';
    assert.ok(data, `missing data`);
    assert.ok(typeof data === 'object', `data must be an object or array`);
    if (Array.isArray(data)) {
      assert.ok(data.length >= 1, `data array must at least have 1 item`);
    } else {
      data = [ data ];
    }
    const fields = Object.keys(data[0]).map(name => sqlEscapeId(name));
    const values = [];
    for (const item of data) {
      assert.ok(item && typeof item === 'object', `every item of data array must be an object`);
      const line = [];
      for (const field in fields) {
        assert.ok(field in item, `every item of data array must have field "${ field }"`);
        line.push(sqlEscape(item[field]));
      }
      values.push(`(${ line.join(', ') })`);
    }
    this._data.insert = `(${ fields.join(', ') }) VALUES ${ values.join(',\n') }`;
    return this;
  }

  /**
   * 删除
   *
   * @return {this}
   */
  delete() {
    assert.ok(this._data.type === '', `cannot change query type after it was set to "${ this._data.type }"`);
    this._data.type = 'DELETE';
    return this;
  }

  /**
   * 自定义SQL语句
   *
   * @param {String} sql
   * @return {this}
   */
  sql(sql) {
    assert.ok(this._data.type === '', `cannot change query type after it was set to "${ this._data.type }"`);
    this._data.type = 'CUSTOM';
    this._data.sql = sqlFormatObject(sql, {
      orderBy: this._data.orderBy,
      limit: this._data.limit,
      fields: this._data.fields,
      skipRows: this._data.skipRows,
      limitRows: this._data.limitRows,
    });
    return this;
  }

  /**
   * 排序方法
   *
   * @param {String} tpl
   * @param {Array|Object} values
   * @return {this}
   */
  order(tpl, values) {
    if (values) {
      this._data.orderFields = this.format(tpl, values);
    } else {
      this._data.orderFields = tpl;
    }
    this._data.orderBy = `ORDER BY ${ this._data.orderFields }`;
    return this;
  }

  /**
   * 跳过指定行数
   *
   * @param {Number} rows
   * @return {this}
   */
  skip(rows) {
    assert.ok(rows >= 0, `rows must >= 0`);
    this._data.skipRows = Number(rows);
    this._data.limit = sqlLimitString(this._data.skip, this._data.limit);
    return this;
  }

  /**
   * 返回指定行数
   *
   * @param {Number} rows
   * @return {this}
   */
  limit(rows) {
    assert.ok(rows >= 0, `rows must >= 0`);
    this._data.limitRows = Number(rows);
    this._data.limit = sqlLimitString(this._data.skip, this._data.limit);
    return this;
  }

  /**
   * 生成 SQL 语句
   *
   * @return {String}
   */
  build() {
    const d = this._data;
    const t = sqlEscapeId(this._tableName);
    const w = d.conditions.join(' AND ');
    const limit = d.limitRows > 0 ? `LIMIT ${ d.limitRows }` : '';
    let sql;
    switch (d.type) {
    case 'SELECT':
      sql = `SELECT ${ d.fields } FROM ${ t } WHERE ${ w } ${ d.orderBy } ${ d.limit }`;
      break;
    case 'INSERT':
      sql = `INSERT INTO ${ t } ${ d.insert }`;
      break;
    case 'UPDATE':
      sql = `UPDATE ${ t } SET ${ d.update } WHERE ${ w } ${ limit }`;
      break;
    case 'DELETE':
      sql = `DELETE FROM ${ t } WHERE ${ w } ${ limit }`;
      break;
    case 'CUSTOM':
      sql = this._data.sql;
      break;
    default:
      throw new Error(`invalid query type "${ d.type }"`);
    }
    return sql.trim();
  }

  /**
   * 执行
   *
   * @param {Function} callback
   * @return {Promise}
   */
  exec(callback) {
    assert.ok(this._execCallback, `please provide a exec callback when create QueryBuilder instance`);
    return this._execCallback(this.build(), callback);
  }

}

module.exports = QueryBuilder;