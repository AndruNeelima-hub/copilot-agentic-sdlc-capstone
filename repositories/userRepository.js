function findById(db, id) {
  return db.prepare('SELECT id, status, disabled_at, deleted_at FROM users WHERE id = ?').get(id) || null;
}

function isAvailable(user) {
  return Boolean(
    user &&
      user.status === 'active' &&
      user.disabled_at == null &&
      user.deleted_at == null
  );
}

module.exports = { findById, isAvailable };