export class EsTemplate {
    public static query = `// All query
GET /myIndex/_search
{
  "query": { "match_all": {} }
}

// Match query
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
}

// Create document
PUT /myIndex/_doc/1
{
  "name": "John Doe"
}

// Update document
POST /myIndex/_doc/1
{
  "name": "John Doe"
}

// Get document 
GET /myIndex/_doc/1

// Delete Document
DELETE /myIndex/_doc/1`;
}