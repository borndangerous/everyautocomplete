var _ = require('lodash');
var async = require('async');
var MongoClient = require('mongodb').MongoClient;
var request = require('request');
var express = require('express');
var app = express();
var resultsCollection;
var alphabet = ' abcdefghijklmnopqrstuvwxyz'.split('');

function getSuggestions(text, callback) {
	request({
			url: 'http://google.com/complete/search',
			gzip: true,
			qs: { client: 'chrome', q: text },
		}, function (error, response, body) {
		var results = [];
		if (!error && response.statusCode == 200) {
			var result = JSON.parse(body);
			var suggestions = result[1];
			var suggesttypes = result[4]['google:suggesttype'];
			for(var i = 0; i < suggestions.length; i++) {
				if(suggesttypes[i] == 'QUERY') {
					results.push(suggestions[i]);
				}
			}
		} else {
			console.log('Error requesting Google suggestions: ' + error);
		}
		callback(null, results);
	})
}

app.use('/', express.static('public'));

app.get('/queries', function (req, res) {
	resultsCollection.find({}, {_id:0, query:1}).toArray(
		function(err, docs) {
			if(docs) {
				docs = docs.map(function(doc) {
					return doc.query;
				});
				res.json({
					count: docs.length,
					queries: docs
				})
			} else {
				res.sendStatus(500);
			}
	});
})

app.get('/search', function (req, res) {
	var query = req.query.q;
	console.log('/search?q=' + query);
	if(!query) {
		res.sendStatus(500);
		return;
	}
	query = query.trim().toLowerCase();
	console.log('searching results for ' + query);
	resultsCollection.findOne( { query: query }, { _id: 0, results: 1 },
		function(err, doc) {
			if(err) {
				console.log('Database error: ' + err);
				res.sendStatus(500);
				return;
			}
			if (doc) {
				console.log('Cached: ' + query);
				res.json(doc.results);
			} else {
				console.log('Lookup: ' + query);
				async.map(alphabet.map(function(letter) {
					return query + ' ' + letter;
				}), getSuggestions, function(err, results) {
				    var unique = _.uniq(_.flatten(results, true));
					resultsCollection.insert({ query: query, results: unique });
				  	res.json(unique);
				});
			}
    });
});

MongoClient.connect(process.env.MONGOLAB_URI, function(err, db) {
  if(err) { return console.dir(err); }
  console.log('Connected to database.');
  resultsCollection = db.collection('results');

  var server = app.listen(process.env.PORT || 3000, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Listening at http://%s:%s', host, port);
  });
});