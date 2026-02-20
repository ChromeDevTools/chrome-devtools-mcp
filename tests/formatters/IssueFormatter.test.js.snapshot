exports[`IssueFormatter > formats a detailed issue toJSONDetailed 1`] = `
{
  "id": 5,
  "type": "issue",
  "title": "Mock Issue Title",
  "description": "# Mock Issue Title\\n\\nThis is a mock issue description sub value",
  "links": [
    {
      "link": "http://example.com",
      "linkTitle": "Link 1"
    }
  ],
  "affectedResources": [
    {
      "uid": "1_1",
      "data": {
        "violatingNodeAttribute": "test"
      }
    }
  ]
}
`;

exports[`IssueFormatter > formats a detailed issue toStringDetailed 1`] = `
ID: 5
Message: issue> Mock Issue Title

This is a mock issue description sub value
Learn more:
[Link 1](http://example.com)
### Affected resources
uid=1_1 data={"violatingNodeAttribute":"test"}
`;

exports[`IssueFormatter > formats a simplified issue toJSON 1`] = `
{
  "type": "issue",
  "title": "Issue Title",
  "count": 5,
  "id": 1
}
`;

exports[`IssueFormatter > formats a simplified issue toString 1`] = `
msgid=1 [issue] Issue Title (count: 5)
`;

exports[`IssueFormatter > formats an issue message toJSON 1`] = `
{
  "type": "issue",
  "title": "Mock Issue Title",
  "id": 5
}
`;

exports[`IssueFormatter > formats an issue message toString 1`] = `
msgid=5 [issue] Mock Issue Title (count: undefined)
`;
