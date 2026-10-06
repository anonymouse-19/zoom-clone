"""
Errors raised by the service layer when a business rule says "no".

Called by: every service. main.py turns each one into an HTTP response with a matching
status code, so services never import anything from FastAPI and stay easy to test.
"""


class ServiceError(Exception):
    """Base class. The message is shown to the user, so write it for humans."""


class NotFoundError(ServiceError):
    """The thing asked for doesn't exist. → HTTP 404"""


class ForbiddenError(ServiceError):
    """The current user isn't allowed to do this (e.g. not the host). → HTTP 403"""


class ConflictError(ServiceError):
    """The request is valid, but not in the resource's current state
    (e.g. editing a meeting that already ended). → HTTP 409"""


class UnavailableError(ServiceError):
    """A temporary failure worth retrying (e.g. no free meeting code found). → HTTP 503"""
