export class EsTemplate {
    public static query = `// Match query
GET /myIndex/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "title":   "Search"        }},
      ],
      "filter": [ 
        { "term":  { "status": "published" }},
        { "range": { "publish_date": { "gte": "2015-01-01" }}}
      ]
    }
  }
}

// Term query
GET /myIndex/_search
{
  "query": {
    "match": {
      "user.id": "kimchy"
    }
  }
}`;
}