'use strict'

const debug = require('debug')('bigview')
const fs = require('fs')
const MyBigView = require('./MyBigView')

module.exports = function (req, res) {
    
    var bigpipe = new MyBigView(req, res, 'error/index', { title: "测试" })
    // bigpipe.mode = 'render'
    bigpipe.add(require('./p1'))
    bigpipe.addErrorPagelet(require('./error'))
    
    if (req.query && req.query.bigview_mode) {
        bigpipe.mode = req.query.bigview_mode
    }
    
    // console.log(bigpipe.mode)
    
    // 从this.cookies('bigview_mode') 其次
    // debug("this.cookies = " + req.cookies)
    if (req.cookies && req.cookies.bigview_mode) {
        bigpipe.mode = req.cookies.bigview_mode
    }

    // bigpipe.preview('aaaa.html')
    // bigpipe.isMock = true
    //  bigpipe.previewFile = 'aaaa.html'
    bigpipe.start()
}