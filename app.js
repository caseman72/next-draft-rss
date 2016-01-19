require("string-utils-cwm");
var _ = require("underscore");
var express = require("express");
var request = require("request");
var jsdom = require("jsdom");

var fs = require("fs");
var jquery_source = fs.readFileSync(__dirname + "/public/js/jquery-2.0.3.min.js", "utf-8");
var server_date_utc = (new Date()).toString().match(/\(UTC\)/) ? true : false;

// process.env reduced by used keys
var process_env = _.pick(process.env, "VCAP_APP_PORT", "VCAP_SERVICES", "NODE_DEBUG");

// this app's secret config values - don't print/log
var config = {
	server_port: process_env.VCAP_APP_PORT || "3030",
	node_debug: process_env.NODE_DEBUG ? true : false
};

// prevent express from defining mount and then overriding it
if (typeof(express.mount) === "undefined") {
	// fix google closure error by mapping static to mount
	express["mount"] = express["static"];
}
else {
	throw new Error('typeof(express.mount) !== "undefined")');
}

var app = express();
app.configure(function() {
	app
		.use(express.favicon(__dirname + "/public/images/favicon.ico"))
		.use(express.mount(__dirname + "/public"))
		.use(express.errorHandler({dumbExceptions: true}))
		.disable('etag')
		.enable("strict routing");
});

app.get("/", function(req, res) {
	var host = req.headers.host || "localhost";
	res.set("Content-Type", "text/plain");
	res.send("Hello World! ({0})".format(host));
});

var short_month = function(index) {
	var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	return months[index].slice(0,3);
};

var pad_zeros = function(int) {
	return ((+int < 10 ? "0" : "")+int);
};

var apache_log = function(req, res, len) {
	var time_stamp = new Date();
	var combined_log = '{ip} - - [{day}/{mon}/{year}:{hour}:{min}:{sec} {tz}] \"{method} {url} HTTP{s}/{v}" {code} {len} "{referer}" "{ua}"'.format({
		ip: req.headers["x-forwarded-for"] && req.headers["x-forwarded-for"].replace(/[ ]+|(?:,\s*127\.0\.0\.1)/g, "") || req.connection.remoteAddress || "127.0.0.1",
		day: pad_zeros(time_stamp.getUTCDate()),
		mon: short_month(time_stamp.getMonth()),
		year: time_stamp.getUTCFullYear(),
		hour: pad_zeros(time_stamp.getUTCHours()),
		min: pad_zeros(time_stamp.getUTCMinutes()),
		sec: pad_zeros(time_stamp.getUTCSeconds()),
		tz: "+0000",
		method: req.method,
		url: req.url,
		s: req.connection.encrypte ? "S" : "",
		v: req.httpVersion,
		code: res.statusCode,
		len: len || "-",
		referer: req.headers["referer"] || req.headers["referrer"] || "-",
		ua: req.headers["user-agent"]
	});

	// log to stdout
	console.log( combined_log );
};

app.get("/rss.htm", function(req, res) {

	var host = req.headers.host || "localhost";

	var request_callback = function(error, response, html) {
		if (error && response.statusCode !== 200) {
			// 500 error
			res.send("500: Internal Server Error", 500);
			return;
		}

		// remove all (no)?script tags
		html = html.replace(/<script[\s\S]+?<\/script>/g, "");
		html = html.replace(/<noscript[\s\S]+?<\/noscript>/g, "");

		jsdom.env({
			html: html,
			src: [jquery_source],
			done: function (not_used_error, window) {
				var $ = window.jQuery;
				var $html = $("<div></div>");

				$(".daily-blurb").each(function(index, blurb) {
					var $item = $("<div><h3><a></a></h3><h5></h5><div class='blurb'></div></div>");

					var $blurb = $(blurb).find(".blurb-content").find(".blurb-list-footer").remove().end();
					var $link = $blurb.find("h3:first").remove().find("a:first");
					var href = $link.attr("href");

					var pub_parts = href.match(/\/n(\d{4})(\d{2})(\d{2})([-][0-9]+)?\//);
					var pub_date = new Date(pub_parts[1], pub_parts[2]-1, pub_parts[3], (server_date_utc ? 28 : 20)-index, 0, 0, 0);

					// "Fri Dec 27 2013 20:00:00 GMT-0800 (PST)" => "Wed, 27 Nov 2013 15:36:14 CST"
					var pub_string = pub_date.toString().replace(/^(.{3})([^,])/, "$1,$2").replace(/([ ])GMT[+-]\d{4}[ ]\(([A-Z]{3})\)$/, "$1$2");

					// update item with values
					$item
						.find("a")
							.html($link.text())
							.attr("href", href)
							.attr("title", $link.text())
						.end()
						.find("h5").html(pub_string).end()
						.find(".blurb").html($blurb.html()).end()
						.appendTo($html);
				});

				// <link>, <pubDate> and CDATA are problems - so use alts and replace
				var res_string = "<html><head></head><body>{0}<br><br><br><br><br></body></html>".format($html.html());

				// log - always 200's
				apache_log(req, res, res_string.length);

				// response
				res.send(res_string);
			}
		});
	};

	// get current nextdraft
	request({
		uri: "http://nextdraft.com/current/",
		headers: _.pick(req.headers, "user-agent")
	}, request_callback);

});

app.get("/rss.xml", function(req, res) {
	res.set("Content-Type", "text/xml");

	var host = req.headers.host || "localhost";

	var request_callback = function(error, response, html) {
		if (error && response.statusCode !== 200) {
			// 500 error
			res.send("500: Internal Server Error", 500);
			return;
		}

		// remove all (no)?script tags
		html = html.replace(/<script[\s\S]+?<\/script>/g, "");
		html = html.replace(/<noscript[\s\S]+?<\/noscript>/g, "");

		jsdom.env({
			html: html,
			src: [jquery_source],
			done: function (not_used_error, window) {
				var $ = window.jQuery;
				var $channel = $("<channel/>");

				$(".daily-blurb").each(function(index, blurb) {
					var $item = $("<item><title></title><clink></clink><guid></guid><pubDate></pubDate><description><cdata></cdata></description></item>");

					var $blurb = $(blurb).find(".blurb-content").find(".blurb-list-footer").remove().end();
					var $link = $blurb.find("h3:first").remove().find("a:first");
					var href = $link.attr("href");

					var pub_parts = href.match(/\/n(\d{4})(\d{2})(\d{2})([-][0-9]+)?\//);
					var pub_date = new Date(pub_parts[1], pub_parts[2]-1, pub_parts[3], (server_date_utc ? 28 : 20)-index, 0, 0, 0);

					// "Fri Dec 27 2013 20:00:00 GMT-0800 (PST)" => "Wed, 27 Nov 2013 15:36:14 CST"
					var pub_string = pub_date.toString().replace(/^(.{3})([^,])/, "$1,$2").replace(/([ ])GMT[+-]\d{4}[ ]\(([A-Z]{3})\)$/, "$1$2");

					// update item with values
					$item
						.find("title").html($link.text()).end()
						.find("clink").html(href).end()
						.find("guid").html(href).end()
						.find("pubDate").html(pub_string).end()
						.find("cdata").html($blurb.html()).end()
						.appendTo($channel);
				});

				// <link>, <pubDate> and CDATA are problems - so use alts and replace
				var items = $channel.html()
					.replace(/[&]nbsp;/g, "&#160;")
					.replace(/[&]copy;/g, "&#169;")
					.replace(/[&]reg;/g, "&#174;")
					.replace(/clink\>/g, "link>")
					.replace(/pubdate\>/g, "pubDate>")
					.replace(/\<cdata\>/g, "<![CDATA[")
					.replace(/\<\/cdata\>/g, "]]>");

				// builg string
				var res_string = [
					'<?xml version="1.0" encoding="utf-8"?>',
					'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
					'<channel>',
					'<title>NextDraft</title>',
					'<description>The Day\'s Most Fascinating News</description>',
					'<link>http://nextdraft.com</link>',
					'<atom:link href="http://{host}/rss.xml" rel="self" type="application/rss+xml"/>',
					'{items}',
					'</channel>',
					'</rss>'].join("\n").format({host: host, items: items});

				// log - always 200's
				apache_log(req, res, res_string.length);

				// response
				res.send(res_string);
			}
		});
	};

	// get current nextdraft
	request({
		uri: "http://nextdraft.com/current/",
		headers: _.pick(req.headers, "user-agent")
	}, request_callback);

});

app.listen(config.server_port, function(){ console.log("Listening on {0}".format(config.server_port)); });

