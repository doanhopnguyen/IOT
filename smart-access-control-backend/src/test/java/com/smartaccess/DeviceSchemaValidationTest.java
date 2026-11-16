package com.smartaccess;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThatCode;

class DeviceSchemaValidationTest {
    @Test void validatesTheFixedWidthPairingHashCreatedByMigrationV10() {
        var dataSource=new DriverManagerDataSource(
                "jdbc:h2:mem:device-schema-"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        var creator=factory(dataSource,"create");
        try { creator.afterPropertiesSet(); }
        finally { creator.destroy(); }
        // Reproduce the physical type in V10 independently of Hibernate's generated mapping.
        new JdbcTemplate(dataSource).execute("ALTER TABLE devices ALTER COLUMN pairing_code_hash CHAR(64)");
        var validator=factory(dataSource,"validate");
        try { assertThatCode(validator::afterPropertiesSet).doesNotThrowAnyException(); }
        finally { validator.destroy(); }
    }

    /** Optional validation of an existing MySQL database: metadata only, no migrations or application schedulers. */
    @Test
    @EnabledIfEnvironmentVariable(named="SMART_ACCESS_SCHEMA_CHECK_URL",matches=".+")
    void validatesExistingMysqlSchemaWithoutWritingData() {
        var dataSource=new DriverManagerDataSource() {
            @Override public Connection getConnection() throws SQLException {
                var connection=super.getConnection();
                connection.setReadOnly(true);
                return connection;
            }
        };
        dataSource.setUrl(System.getenv("SMART_ACCESS_SCHEMA_CHECK_URL"));
        dataSource.setUsername(System.getenv().getOrDefault("SMART_ACCESS_SCHEMA_CHECK_USERNAME","root"));
        dataSource.setPassword(System.getenv().getOrDefault("SMART_ACCESS_SCHEMA_CHECK_PASSWORD",""));
        var validator=factory(dataSource,"validate");
        try { assertThatCode(validator::afterPropertiesSet).doesNotThrowAnyException(); }
        finally { validator.destroy(); }
    }

    private LocalContainerEntityManagerFactoryBean factory(DataSource dataSource,String schemaAction) {
        var factory=new LocalContainerEntityManagerFactoryBean();
        factory.setDataSource(dataSource);
        factory.setPackagesToScan("com.smartaccess.model");
        factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto",schemaAction,"hibernate.show_sql",false));
        return factory;
    }
}
