// Minimal backup module
exports.getBackupStatus = () => {
    return {
        status: 'none',
        lastBackup: null
    };
};