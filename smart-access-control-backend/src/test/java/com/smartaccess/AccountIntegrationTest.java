package com.smartaccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartaccess.dto.account.*;
import com.smartaccess.exception.BusinessException;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.*;
import com.smartaccess.security.AccountPrincipal;
import com.smartaccess.service.AccountService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Requires a separately provisioned disposable MySQL database; never defaults to smart_access. */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "SMART_ACCESS_DB_TEST_URL", matches = ".+")
class AccountIntegrationTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("SMART_ACCESS_DB_TEST_URL"));
        properties.add("spring.datasource.username", () -> System.getenv().getOrDefault("SMART_ACCESS_DB_TEST_USERNAME", "root"));
        properties.add("spring.datasource.password", () -> System.getenv().getOrDefault("SMART_ACCESS_DB_TEST_PASSWORD", ""));
        properties.add("spring.jpa.show-sql", () -> "false");
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AccountService service;
    @Autowired AccountRepository accounts;
    @Autowired AccessUnitRepository units;
    @Autowired UserAccessRepository memberships;
    @Autowired PasswordEncoder passwords;
    @Autowired SessionRegistry sessions;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    List<Long> accountIds = Collections.synchronizedList(new ArrayList<>());
    List<Long> unitIds = new ArrayList<>();
    List<UserAccessId> membershipIds = new ArrayList<>();

    @AfterEach void cleanupOwnFixtures() {
        for (Long id : accountIds) {
            sessions.getAllSessions(new AccountPrincipal(id), true)
                    .forEach(session -> sessions.removeSessionInformation(session.getSessionId()));
        }
        memberships.deleteAllById(membershipIds);
        units.deleteAllById(unitIds);
        accounts.deleteAllById(accountIds);
    }

    String email() { return "auth-" + UUID.randomUUID() + "@example.test"; }
    String phone() { return "09" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000)); }

    AccountResponse account(boolean admin) {
        var result = service.register(new RegisterRequest("Integration User", email(), phone(), "Password123!"));
        accountIds.add(result.accountId());
        if (admin) {
            Account account = accounts.findById(result.accountId()).orElseThrow();
            account.setAdmin(true); accounts.saveAndFlush(account);
            return AccountResponse.from(account);
        }
        return result;
    }

    class Client {
        MockHttpSession session;

        MvcResult get(String path, int expected) throws Exception {
            var builder = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path);
            if (session != null) { builder.session(session); }
            var result = mvc.perform(builder).andExpect(status().is(expected)).andReturn();
            session = (MockHttpSession) result.getRequest().getSession(false);
            return result;
        }

        MvcResult write(HttpMethod method, String path, Map<String, ?> body, int expected) throws Exception {
            var csrf = get("/api/auth/csrf", 200);
            var token = json.readTree(csrf.getResponse().getContentAsString()).get("token").asText();
            var result = mvc.perform(request(method, path).session(session).header("X-CSRF-TOKEN", token)
                    .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                    .andExpect(status().is(expected)).andReturn();
            session = (MockHttpSession) result.getRequest().getSession(false);
            return result;
        }

        void login(String identifier, String password, int expected) throws Exception {
            write(HttpMethod.POST, "/api/auth/login", Map.of("identifier", identifier, "password", password), expected);
        }
    }

    @Test void registrationPersistsHashAndBothLoginIdentifiersWork() throws Exception {
        String email = email(); String phone = phone(); Client client = new Client();
        var registered = client.write(HttpMethod.POST, "/api/auth/register", Map.of(
                "fullName", "User", "email", email.toUpperCase(Locale.ROOT), "phone", phone,
                "password", "Password123!", "admin", true), 201);
        Long id = json.readTree(registered.getResponse().getContentAsString()).get("accountId").asLong();
        accountIds.add(id);
        Account stored = accounts.findById(id).orElseThrow();
        assertThat(stored.isAdmin()).isFalse();
        assertThat(stored.getEmail()).isEqualTo(email);
        assertThat(passwords.matches("Password123!", stored.getPasswordHash())).isTrue();
        assertThat(registered.getResponse().getContentAsString()).doesNotContain("passwordHash", "Password123!");
        client.write(HttpMethod.POST, "/api/auth/register", Map.of("fullName", "Duplicate", "email", email, "password", "Password123!"), 409);
        client.write(HttpMethod.POST, "/api/auth/register", Map.of("fullName", "Duplicate", "phone", phone, "password", "Password123!"), 409);
        client.login(email.toUpperCase(Locale.ROOT), "Password123!", 200);
        client.get("/api/accounts/me", 200);
        new Client().login(phone, "Password123!", 200);
    }

    @Test void profileUpdatePersistsAndLoginUsesNewContacts() throws Exception {
        var user = account(false); Client client = new Client(); client.login(user.email(), "Password123!", 200);
        String newEmail = email(); String newPhone = phone();
        client.write(HttpMethod.PATCH, "/api/accounts/me", Map.of("fullName", "New Name", "email", newEmail, "phone", newPhone,
                "accountId", 999, "admin", true, "status", "DISABLED"), 200);
        Account stored = accounts.findById(user.accountId()).orElseThrow();
        assertThat(stored.getFullName()).isEqualTo("New Name");
        assertThat(stored.isAdmin()).isFalse();
        assertThat(stored.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        new Client().login(user.email(), "Password123!", 401);
        new Client().login(user.phone(), "Password123!", 401);
        new Client().login(newEmail, "Password123!", 200);
        new Client().login(newPhone, "Password123!", 200);
        client.get("/api/accounts/me", 200);
        client.write(HttpMethod.PATCH, "/api/accounts/me", Map.of("email", "", "phone", ""), 400);
        assertThat(accounts.findById(user.accountId()).orElseThrow().getEmail()).isEqualTo(newEmail);
    }

    @Test void committedPasswordChangeRevokesAllSessionsAndFailedChangeDoesNot() throws Exception {
        var user = account(false); Client first = new Client(); Client second = new Client();
        first.login(user.email(), "Password123!", 200); second.login(user.phone(), "Password123!", 200);
        first.write(HttpMethod.PUT, "/api/accounts/me/password", Map.of("currentPassword", "WrongPassword", "newPassword", "NewPassword123!"), 400);
        first.get("/api/accounts/me", 200); second.get("/api/accounts/me", 200);
        first.write(HttpMethod.PUT, "/api/accounts/me/password", Map.of("currentPassword", "Password123!", "newPassword", "NewPassword123!"), 204);
        first.get("/api/accounts/me", 401); second.get("/api/accounts/me", 401);
        new Client().login(user.email(), "Password123!", 401);
        new Client().login(user.phone(), "NewPassword123!", 200);
    }

    @Test void adminLockPreservesMembershipAndUnlockDoesNotRestoreOldSessions() throws Exception {
        var admin = account(true); var user = account(false); var otherAdmin = account(true);
        AccessUnit unit = new AccessUnit(); unit.setManager(accounts.findById(user.accountId()).orElseThrow()); unit.setUnitName("Fixture door");
        unit = units.saveAndFlush(unit); unitIds.add(unit.getUnitId());
        UserAccess member = new UserAccess(); member.setAccount(accounts.findById(user.accountId()).orElseThrow()); member.setAccessUnit(unit);
        member.setId(new UserAccessId(user.accountId(), unit.getUnitId())); member.setAllowRemoteUnlock(true);
        memberships.saveAndFlush(member); membershipIds.add(member.getId());
        Client first = new Client(); Client untouched = new Client(); Client owner = new Client();
        first.login(user.email(), "Password123!", 200); untouched.login(user.email(), "Password123!", 200);
        owner.login(admin.email(), "Password123!", 200);
        first.write(HttpMethod.PATCH, "/api/admin/accounts/" + admin.accountId() + "/status", Map.of("status", "DISABLED"), 403);
        owner.write(HttpMethod.PATCH, "/api/admin/accounts/" + admin.accountId() + "/status", Map.of("status", "DISABLED"), 403);
        owner.write(HttpMethod.PATCH, "/api/admin/accounts/" + otherAdmin.accountId() + "/status", Map.of("status", "DISABLED"), 403);
        String hash = accounts.findById(user.accountId()).orElseThrow().getPasswordHash();
        owner.write(HttpMethod.PATCH, "/api/admin/accounts/" + user.accountId() + "/status", Map.of("status", "DISABLED"), 200);
        first.get("/api/accounts/me", 401);
        new Client().login(user.phone(), "Password123!", 401);
        assertThat(memberships.findById(member.getId()).orElseThrow().isAllowRemoteUnlock()).isTrue();
        assertThat(accounts.findById(user.accountId()).orElseThrow().getPasswordHash()).isEqualTo(hash);
        owner.write(HttpMethod.PATCH, "/api/admin/accounts/" + user.accountId() + "/status", Map.of("status", "ACTIVE"), 200);
        untouched.get("/api/accounts/me", 401);
        new Client().login(user.phone(), "Password123!", 200);
        owner.get("/api/accounts/me", 200);
    }

    @Test void rolledBackPasswordAndStatusChangesDoNotRevokeSessions() throws Exception {
        var user = account(false); var admin = account(true); Client client = new Client();
        client.login(user.email(), "Password123!", 200);
        String hash = accounts.findById(user.accountId()).orElseThrow().getPasswordHash();
        new TransactionTemplate(transactions).executeWithoutResult(transaction -> {
            service.changePassword(user.accountId(), new ChangePasswordRequest("Password123!", "NewPassword123!"));
            service.changeStatus(admin.accountId(), user.accountId(), AccountStatus.DISABLED);
            transaction.setRollbackOnly();
        });
        client.get("/api/accounts/me", 200);
        Account stored = accounts.findById(user.accountId()).orElseThrow();
        assertThat(stored.getPasswordHash()).isEqualTo(hash);
        assertThat(stored.getStatus()).isEqualTo(AccountStatus.ACTIVE);
    }

    @Test void concurrentDuplicateRegistrationsCreateExactlyOneAccount() throws Exception {
        String email = email(); CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        Callable<Integer> register = () -> {
            start.await();
            try {
                var result = service.register(new RegisterRequest("Concurrent", email, null, "Password123!"));
                accountIds.add(result.accountId()); return 201;
            } catch (DataIntegrityViolationException exception) { return 409; }
            catch (BusinessException exception) {
                if (exception.getStatus() == HttpStatus.CONFLICT) { return 409; }
                throw exception;
            }
        };
        try {
            var first = executor.submit(register); var second = executor.submit(register); start.countDown();
            assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(201, 409);
            assertThat(jdbc.queryForObject("select count(*) from accounts where email = ?", Long.class, email)).isEqualTo(1);
        } finally { executor.shutdownNow(); }
    }
}
