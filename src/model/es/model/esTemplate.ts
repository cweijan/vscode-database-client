export class EsTemplate {
    public static query = `// All query
GET /myIndex/_search
{
  "query": { "match_all": {} }
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
POST /<index>/_update/1
{
  "name": "John Doe"
}

// Get document 
GET /myIndex/_doc/1

// Delete Document
DELETE /myIndex/_doc/1`;
}