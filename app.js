require("string-utils-cwm");
var _ = require("underscore");
var express = require("express");
var request = require("request");
var jsdom = require("jsdom");

var fs = require("fs");
var jquery_source = fs.readFileSync(__dirname + "/public/js/jquery-2.0.3.min.js", "utf-8");
var server_date_string = (new Date()).toString();

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
		.enable("strict routing");
});

app.get("/", function(req, res) {
	var host = req.headers.host || "localhost";
	res.set("Content-Type", "text/plain");
	res.send("Hello World! ({0})".format(host));
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

					var pub_parts = href.match(/\/n(\d{4})(\d{2})(\d{2})\//);
					var pub_date = new Date(pub_parts[1], pub_parts[2]-1, pub_parts[3], (server_date_string.match(/\(UTC\)/) ? 28 : 20)-index, 0, 0, 0);
					// "Fri Dec 27 2013 20:00:00 GMT-0800 (PST)" => "Wed, 27 Nov 2013 15:36:14 CST"
					var pub_string = pub_date.toString().replace(/^(.{3}) /, "$1, ").replace(/ GMT[+-]\d{4} \(([A-Z]{3})\)$/, " $1");

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
					.replace(/clink\>/g, "link>")
					.replace(/pubdate\>/g, "pubDate>")
					.replace(/\<cdata\>/g, "<![CDATA[")
					.replace(/\<\/cdata\>/g, "]]>");

				// response
				res.send([
					'<?xml version="1.0" encoding="utf-8"?>',
					'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
					'<channel>',
					'<title>NextDraft</title>',
					'<description>The Day\'s Most Fascinating News</description>',
					'<link>http://nextdraft.com</link>',
					'<atom:link href="http://{host}/rss.xml" rel="self" type="application/rss+xml"/>',
					'{items}',
					'</channel>',
					'</rss>'].join("\n").format({
						host: host,
						items: items
					})
				);
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

