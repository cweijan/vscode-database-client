CREATE TABLE user(  
    id int NOT NULL PRIMARY KEY AUTO_INCREMENT COMMENT 'Primary Key',
    create_time DATETIME COMMENT 'Create Time',
    ip VARCHAR(255) COMMENT 'ip',
    user_name VARCHAR(255) COMMENT '用户名',
    platform VARCHAR(255) COMMENT '操作系统',
    version VARCHAR(255) COMMENT '版本'
) DEFAULT CHARSET UTF8 COMMENT '';