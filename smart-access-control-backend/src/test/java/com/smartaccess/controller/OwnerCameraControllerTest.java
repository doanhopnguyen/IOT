package com.smartaccess.controller;

import com.smartaccess.model.Account;
import com.smartaccess.repository.DeviceRepository;
import com.smartaccess.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Endpoint tự cấp camera cũ đã bị bỏ; chỉ còn ghép bằng mã do admin cấp. */
class OwnerCameraControllerTest {
    final CurrentAccountService current = mock(CurrentAccountService.class);
    final ManagerAccessGuard guard = mock(ManagerAccessGuard.class);
    final EdgeAiPairingService pairing = mock(EdgeAiPairingService.class);
    final MockMvc mvc = MockMvcBuilders.standaloneSetup(new OwnerCameraController(current, guard,
            mock(DeviceRepository.class), mock(PasswordEncoder.class), pairing)).build();

    @Test void legacySelfProvisioningEndpointIsGoneAndPairRequiresTheCode() throws Exception {
        Account owner = new Account(); owner.setAccountId(5L);
        when(current.requireAccount()).thenReturn(owner);
        when(pairing.pair(5L, 7L, "AI-000000-000000-000000-000001", "pw"))
                .thenReturn(new EdgeAiPairingService.Issued("FACE-1", "secret"));

        mvc.perform(post("/api/manager/units/7/camera-node").contentType(MediaType.APPLICATION_JSON)
                .content("{\"password\":\"pw\"}")).andExpect(status().isMethodNotAllowed());
        verifyNoInteractions(pairing);

        mvc.perform(post("/api/manager/units/7/camera-node/pair").contentType(MediaType.APPLICATION_JSON)
                .content("{\"password\":\"pw\",\"pairingCode\":\"AI-000000-000000-000000-000001\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deviceUid").value("FACE-1"));
        verify(pairing).pair(5L, 7L, "AI-000000-000000-000000-000001", "pw");
    }
}
