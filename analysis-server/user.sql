CREATE TABLE user(  
    id int NOT NULL PRIMARY KEY AUTO_INCREMENT COMMENT 'Primary Key',
    create_time DATETIME COMMENT 'Create Time',
    ip VARCHAR(255) COMMENT 'ip',
    user_name VARCHAR(255) COMMENT '用户名',
    platform VARCHAR(255) COMMENT '操作系统',
    version VARCHAR(255) COMMENT '版本'
) DEFAULT CHARSET UTF8 COMMENT '';

ALTER TABLE user ADD COLUMN info VARCHAR(1000) comment '系统信息';
ALTER TABLE user ADD COLUMN ext VARCHAR(200)  comment '扩展名';
ALTER TABLE user ADD COLUMN git_name VARCHAR(1000)  comment 'git用户名';

SELECT COUNT(DISTINCT ip) FROM user;