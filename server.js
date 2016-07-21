var unirest = require('unirest');
var express = require('express');
var events = require('events');

var getFromApi = function(endpoint, args) {
    var emitter = new events.EventEmitter();
    unirest.get('https://api.spotify.com/v1/' + endpoint)
        .qs(args)
        .end(function(response) {
            if (response.ok) {
                emitter.emit('end', response.body);
            } else {
                emitter.emit('error', response.code);
            }
        });
    return emitter;
};

var getFromApiBatch = function(inURLs) {
    var emitter = new events.EventEmitter();
    var i;
    var done = 0;
    var output = [];

    function collect(inIndex, inData) {
        output[inIndex] = inData;

        done++;
        if (done == inURLs.length) {
            emitter.emit('end', output);
        }
    }

    for (i = 0; i < inURLs.length; i++) {

        var request = getFromApi(inURLs[i]);
        request._index = i;
        request.on('end', function(inData) {
            collect(this._index, inData);
        });
        request.on('error', function(inCode) {
            collect(this._index, {
                error: inCode
            });
        });
    }

    return emitter;
};



var app = express();
app.use('/', express.static(__dirname + '/public'));
app.get('/search/:name', function(inReq, inRes) {
    var searchArtist, searchRelated, searchTracks;
    var artist;

    searchArtist = getFromApi('search', {
        q: inReq.params.name,
        limit: 1,
        type: 'artist'
    });
    searchArtist.on('end', function(inData) {

        if (inData.artists.items.length > 0) {

            //artist
            artist = inData.artists.items[0];

            searchRelated = getFromApi('artists/' + artist.id + '/related-artists');
            searchRelated.on('end', function(inRelated) {
                var i;
                var tracks;
                var batch;

                //related artists
                artist.related = inRelated.artists;

                tracks = [];
                for (i = 0; i < artist.related.length; i++) {
                    tracks[i] = 'artists/' + artist.related[i].id + '/top-tracks?country=US';
                }
                batch = getFromApiBatch(tracks);
                batch.on('end', function(inTracks) {
                    for (i = 0; i < artist.related.length; i++) {
                        artist.related[i].tracks = inTracks[i].tracks;
                    }
                    inRes.json(artist);
                });
            });
            searchRelated.on('error', function(incode) {
                inRes.sendStatus(inCode);
            });
        } else {
            inRes.json({
                name: 'nothing found for \"' + inReq.params.name + '\"'
            });
        }
    });
    searchArtist.on('error', function(inCode) {
        inRes.sendStatus(inCode);
    });
});


var port = Number(process.env.PORT || 3000);

app.listen(port);