package com.smartaccess.service;

import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import java.util.concurrent.*;

/** Executor riêng cho job nạp code: một thread, vì USB máy backend chỉ phục vụ một thao tác mỗi lúc. */
public interface ProvisioningExecutor extends Executor {
    @Component
    class SingleThread implements ProvisioningExecutor {
        private final ExecutorService delegate = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "device-provisioning"); t.setDaemon(true); return t;
        });
        @Override public void execute(Runnable task) { delegate.execute(task); }
        @PreDestroy void stop() { delegate.shutdownNow(); }
    }
}
