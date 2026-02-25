/**
 * Build list options from query params: pagination, search, filter.
 * @param {object} req - Express request (req.query)
 * @param {object} options - { searchFields: string[], filterSchema: { [key]: type } }
 * @returns { { query: object, skip: number, limit: number, sort: object, page: number } }
 */
function buildListQuery(req, options = {}) {
  const { searchFields = [], filterSchema = {}, defaultSort = { createdAt: -1 } } = options;
  const query = {};

  // Pagination: page, limit
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  // Search: single `search` param, matched against searchFields (case-insensitive)
  const search = (req.query.search || "").trim();
  if (search && searchFields.length) {
    query.$or = searchFields.map((field) => ({
      [field]: new RegExp(search, "i"),
    }));
  }

  // Filter: use filterSchema; values from query e.g. ?totalItem=5 or ?filter[totalItem]=5
  const filterParam = req.query;
  for (const [key, type] of Object.entries(filterSchema)) {
    let value = filterParam[key] ?? filterParam[`filter[${key}]`];
    if (value === undefined || value === "") continue;
    if (type === "number") value = Number(value);
    if (type === "ObjectId") query[key] = value;
    else query[key] = value;
  }

  // Sort: sort=field or sort=-field for desc
  let sort = defaultSort;
  const sortParam = (req.query.sort || "").trim();
  if (sortParam) {
    const desc = sortParam.startsWith("-");
    const field = desc ? sortParam.slice(1) : sortParam;
    sort = { [field]: desc ? -1 : 1 };
  }

  return { query, skip, limit, sort, page };
}

module.exports = { buildListQuery };
