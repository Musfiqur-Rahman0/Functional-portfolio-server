const paginate = async (collection, query = {}, reqQuery = {}) => {
  const page = parseInt(reqQuery.page) || 1;
  const limit = parseInt(reqQuery.limit) || 10;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    collection.find(query).skip(skip).limit(limit).toArray(),
    collection.countDocuments(query),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    data,
  };
};

module.exports = paginate;
