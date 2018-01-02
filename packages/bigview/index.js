'use strict';

const debug = require('debug')('bigview');

global.Promise = require("bluebird");

const BigViewBase = require('./base');
const Utils = require('./utils');
const PROMISE_RESOLVE = Promise.resolve(true);

class BigView extends BigViewBase {
    constructor(req, res, layout, data) {
        super(req, res, layout, data);
        
        this.debug = process.env.BIGVIEW_DEBUG || false;
        
        // 布局文件，在渲染布局前是可以改的
        this.layout = layout;

        // 用于为页面模板提供数据
        // 如果是动态布局会自动注入pagelets
        this.data = data || {};

        // 存放add的pagelets，带有顺序和父子级别
        this.pagelets = [];

        this.done = false;
        
        // timeout = 30s
        this.timeout = 30000;

        // 默认是pipeline并行模式，pagelets快的先渲染
        // 页面render的梳理里会有this.data.pagelets
    }

    _getPageletObj(Pagelet) {
        let pagelet;

        if (Pagelet.domid && Pagelet.root) {
            pagelet = Pagelet;
        } else {
            pagelet = new Pagelet();
        }

        pagelet.owner = this;
        pagelet.dataStore = this.dataStore;

        return pagelet;
    }

    add(Pagelet) {
        let pagelet = this._getPageletObj(Pagelet);
        this.pagelets.push(pagelet);
    }

    // refact
    addErrorPagelet(Pagelet) {
        let pagelet = this._getPageletObj(Pagelet);
        this.errorPagelet = pagelet;
    }

    /**
     * show error pagelet to Browser. only after bigview renderLayout
     *
     * @api public;
     */
    showErrorPagelet(error) {
        debug(error);
        // reset this.pagelets
        this.pagelets = [this.errorPagelet];

        // start with render error pagelet
        this.renderPagelets()
            .then(this.end.bind(this))
            .catch(this.processError.bind(this))

        return Promise.reject(new Error('interrupt， no need to continue!'))
    }

    start() {
        debug('BigView start');

        // 1) this.before
        // 2）renderLayout: 渲染布局
        // 3）renderPagelets: Promise.all() 并行处理pagelets（策略是随机，fetch快的优先）
        // 4）this.end 通知浏览器，写入完成
        // 5) processError

        return this.before()
            .then(this.beforeRenderLayout.bind(this))
            .then(this.renderLayout.bind(this))
            .then(this.afterRenderLayout.bind(this))
            .catch(this.showErrorPagelet.bind(this))
            .then(this.beforeRenderPagelets.bind(this))
            .then(this.renderPagelets.bind(this))
            .then(this.afterRenderPagelets.bind(this))
            .then(this.end.bind(this))
                .timeout(this.timeout)
                .catch(Promise.TimeoutError, this.renderPageletstimeoutFn.bind(this))
            .catch(this.processError.bind(this))
    }
    
    before() {
        debug('default before');
        return PROMISE_RESOLVE;
    }

    /**
     * compile（tpl + data）=> html
     *
     * @api public
     */
    compile(tpl, data) {
        let self = this;

        return new Promise(function(resolve, reject) {
            debug('renderLayout');
            self.res.render(tpl, data, function(err, str) {
                if (err) {
                    debug('renderLayout ' + str);
                    Utils.log(err);
                    return reject(err)
                }
                debug(str);
                let html = str + Utils.ready(self.debug)
                
                // 在pipeline模式下会直接写layout到浏览器
                self.write(html, self.modeInstance.isLayoutWriteImmediately);
                //html没用到
                resolve(html)
            })
        })
    }

    renderLayout() {
        debug("BigView renderLayout");

        // 默认注入pagelets和errorPagelet信息
        this.data.pagelets = this.pagelets;
        this.data.errorPagelet = this.errorPagelet;

        let self = this;

        return self.compile(self.layout, self.data).then(function(str) {
            return str;
        })
    }

    renderPagelets() {
        debug("BigView  renderPagelets start");
        let bigview = this;
        return this.modeInstance.execute(bigview.pagelets)
    }

    end() {
        if (this.done) {
            let err = new Error("bigview.done = true");
            return Promise.reject(err);
        }

        if (this.cache.length > 0) {
            // 如果缓存this.cache里有数据，先写到浏览器，然后再结束
            // true will send right now
            let isWriteImmediately = true;
            let html = this.cache.join('');
            
            // 在end时，无论如何都要输出布局
            this.modeInstance.isLayoutWriteImmediately = true

            this.write(html, isWriteImmediately)
        }

        debug("BigView end");

        let self = this;

        // lifecycle self.after before res.end
        return self.after().then(function() {
            self.res.end(Utils.end());
            return self.done = true;
        });
    }

    after() {
        debug('default after');
        return PROMISE_RESOLVE;
    }
    
    renderPageletstimeoutFn(err) {
        Utils.log('timeout in ' + this.timeout + ' ms')
        Utils.log(err)
        return this.end()
    }
};

module.exports = BigView;
