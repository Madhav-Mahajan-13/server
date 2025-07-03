exports.getTest = async (req, res) => {
  try {
    const result = await req.pool.query('SELECT NOW()');
    res.json({ message: 'API working!', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
};
