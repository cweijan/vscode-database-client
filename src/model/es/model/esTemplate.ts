export class EsTemplate {
    public static query = `GET /myIndex/_search
{
  "query": {
    "bool": {
      "must": [
        {
          "match_all": {}
        }
      ],
      "filter": [],
      "should": [],
      "must_not": []
    }
  },
  "_source": {
    "includes":[$fields]
  },
  "sort": [
    {
      "_score": {
        "order": "desc"
      }
    }
  ],
  "highlight": {
    "pre_tags": [
      "<span style='color:red;'>"
    ],
    "post_tags": [
      "</span>"
    ],
    "fields": {
      "*": {}
    },
    "fragment_size": 2147483647
  }
}`;
}