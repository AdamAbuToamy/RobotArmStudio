"""Optional LAN listener, controlled by the authenticated local interface."""
import asyncio
import secrets
from aiohttp import web

class PhoneSharing:
    def __init__(self, studio, app_factory, address_provider):
        self.studio = studio
        self.app_factory = app_factory
        self.address_provider = address_provider
        self.lock = asyncio.Lock()
        self.runner = None
        self.site = None
        self.app = None
        self.port = None
        self.pending_cleanup = set()

    def status(self):
        urls = []
        if self.site:
            urls = [f'http://{address}:{self.port}/?token={self.studio.control_token}' for address in self.address_provider()]
        return {'enabled': self.site is not None, 'urls': urls, 'pin': self.studio.pin, 'port': self.port}

    async def set_enabled(self, enabled):
        async with self.lock:
            if enabled and self.site is None:
                app = self.app_factory()
                runner = web.AppRunner(app, shutdown_timeout=2)
                await runner.setup()
                site = web.TCPSite(runner, host='0.0.0.0', port=0)
                try:
                    await site.start()
                except BaseException:
                    await runner.cleanup()
                    raise
                self.app, self.runner, self.site = app, runner, site
                self.port = site._server.sockets[0].getsockname()[1]
            elif not enabled and self.site is not None:
                app, runner, site = self.app, self.runner, self.site
                self.app = self.runner = self.site = self.port = None
                await site.stop()
                if self.studio.controller_scope is app and self.studio.controller:
                    ws = self.studio.controller
                    self.studio.controller = None
                    await self.studio.send('0 STOP')
                    await ws.close(code=1001, message=b'Phone sharing disabled')
                # Allow a phone's own disable request to receive its response first.
                task = asyncio.create_task(self._cleanup_after_response(runner))
                self.pending_cleanup.add(task)
                task.add_done_callback(self.pending_cleanup.discard)
            return self.status()

    async def _cleanup_after_response(self, runner):
        await asyncio.sleep(.05)
        await runner.cleanup()

    async def close(self):
        await self.set_enabled(False)
        if self.pending_cleanup:
            await asyncio.gather(*list(self.pending_cleanup), return_exceptions=True)
